import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TEXT_LENGTH = 1_000_000;

/**
 * Stable error type for the main process and renderer to classify bridge failures.
 */
export class WindowsBridgeError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "WindowsBridgeError";
    this.code = code;
    this.operation = options.operation ?? "windows-bridge";
    this.details = options.details;
  }
}

function bridgeError(code, message, operation, cause, details) {
  if (cause instanceof WindowsBridgeError) {
    return cause;
  }

  return new WindowsBridgeError(code, message, {
    operation,
    cause,
    details,
  });
}

function assertText(value, field, { allowEmpty = true } = {}) {
  if (typeof value !== "string") {
    throw new WindowsBridgeError(
      "INVALID_TEXT",
      `${field} must be a string`,
      { operation: field },
    );
  }

  if (!allowEmpty && value.trim().length === 0) {
    throw new WindowsBridgeError(
      "EMPTY_TEXT",
      `${field} must not be empty`,
      { operation: field },
    );
  }

  if (value.length > MAX_TEXT_LENGTH) {
    throw new WindowsBridgeError(
      "TEXT_TOO_LARGE",
      `${field} is too large to transfer safely`,
      { operation: field, details: { maxLength: MAX_TEXT_LENGTH } },
    );
  }

  return value;
}

function withTimeout(operation, operationName, timeoutMs) {
  const safeTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new WindowsBridgeError(
        "BRIDGE_TIMEOUT",
        `${operationName} timed out after ${safeTimeout}ms`,
        { operation: operationName, details: { timeoutMs: safeTimeout } },
      ));
    }, safeTimeout);

    Promise.resolve()
      .then(operation)
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

function encodePowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

/**
 * Run a trusted, static PowerShell program.
 *
 * Untrusted values are sent as JSON over stdin, never interpolated into the
 * PowerShell source or command-line arguments. The injectable runner used by
 * tests/main-process adapters receives the same `(script, options)` shape.
 */
export function runPowerShell(script, options = {}) {
  if (process.platform !== "win32") {
    return Promise.reject(new WindowsBridgeError(
      "PLATFORM_UNSUPPORTED",
      "Windows bridge is only available on Windows",
      { operation: "runPowerShell" },
    ));
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TIMEOUT_MS;
  const input = options.input ?? {};

  let serializedInput;
  try {
    serializedInput = JSON.stringify(input);
  } catch (error) {
    return Promise.reject(bridgeError(
      "INVALID_INPUT",
      "PowerShell input could not be serialized",
      "runPowerShell",
      error,
    ));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-Sta",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodePowerShell(script),
      ],
      {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new WindowsBridgeError(
        "BRIDGE_TIMEOUT",
        `PowerShell timed out after ${timeoutMs}ms`,
        { operation: "runPowerShell", details: { timeoutMs } },
      ));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(bridgeError(
        "POWERSHELL_START_FAILED",
        "Could not start PowerShell",
        "runPowerShell",
        error,
      ));
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(new WindowsBridgeError(
          "POWERSHELL_FAILED",
          stderr.trim() || `PowerShell exited with code ${code}`,
          {
            operation: "runPowerShell",
            details: { exitCode: code },
          },
        ));
        return;
      }

      resolve(stdout.trim());
    });

    child.stdin.on("error", () => {
      // The close/error event below is the authoritative process result.
    });
    child.stdin.end(serializedInput, "utf8");
  });
}

let defaultClipboardPromise;

async function getDefaultClipboard() {
  if (!defaultClipboardPromise) {
    defaultClipboardPromise = import("electron")
      .then((electron) => electron.clipboard)
      .catch((error) => {
        defaultClipboardPromise = undefined;
        throw bridgeError(
          "CLIPBOARD_UNAVAILABLE",
          "Electron clipboard API is unavailable",
          "clipboard",
          error,
        );
      });
  }

  return defaultClipboardPromise;
}

async function readClipboard(clipboard, timeoutMs) {
  return withTimeout(async () => {
    const api = clipboard ?? await getDefaultClipboard();
    if (typeof api.readText !== "function") {
      throw new WindowsBridgeError(
        "CLIPBOARD_UNAVAILABLE",
        "Injected clipboard API does not provide readText()",
        { operation: "clipboard.readText" },
      );
    }
    return assertText(await api.readText(), "clipboard text");
  }, "clipboard.readText", timeoutMs);
}

async function writeClipboard(clipboard, text, timeoutMs) {
  return withTimeout(async () => {
    const api = clipboard ?? await getDefaultClipboard();
    if (typeof api.writeText !== "function") {
      throw new WindowsBridgeError(
        "CLIPBOARD_UNAVAILABLE",
        "Injected clipboard API does not provide writeText()",
        { operation: "clipboard.writeText" },
      );
    }
    await api.writeText(assertText(text, "clipboard text"));
  }, "clipboard.writeText", timeoutMs);
}

function getRunnerOutput(result) {
  if (typeof result === "string" || result == null) {
    return result ?? "";
  }
  if (typeof result.stdout === "string") {
    return result.stdout;
  }
  if (typeof result.output === "string") {
    return result.output;
  }
  return result;
}

function parseTarget(result) {
  const output = getRunnerOutput(result);
  let target = output;

  if (typeof output === "string") {
    try {
      target = JSON.parse(output);
    } catch (error) {
      throw bridgeError(
        "TARGET_INVALID",
        "PowerShell did not return a valid target window identifier",
        "capturePrompt",
        error,
      );
    }
  }

  if (target && target.target) {
    target = target.target;
  }

  const handle = target?.handle ?? target?.hwnd ?? target?.windowHandle;
  if (!Number.isSafeInteger(handle) || handle <= 0) {
    throw new WindowsBridgeError(
      "TARGET_INVALID",
      "Target window identifier is missing or invalid",
      { operation: "capturePrompt" },
    );
  }

  return {
    handle,
    ...(typeof target.title === "string" ? { title: target.title } : {}),
    ...(Number.isSafeInteger(target.processId) ? { processId: target.processId } : {}),
    ...(Number.isSafeInteger(target.focusHandle) && target.focusHandle > 0
      ? { focusHandle: target.focusHandle }
      : {}),
  };
}

function normalizeTarget(target) {
  if (Number.isSafeInteger(target) && target > 0) {
    return { handle: target };
  }

  if (target && typeof target === "object") {
    const handle = target.handle ?? target.hwnd ?? target.windowHandle;
    if (Number.isSafeInteger(handle) && handle > 0) {
      return {
        handle,
        ...(typeof target.title === "string" ? { title: target.title } : {}),
        ...(Number.isSafeInteger(target.processId) ? { processId: target.processId } : {}),
        ...(Number.isSafeInteger(target.focusHandle) && target.focusHandle > 0
          ? { focusHandle: target.focusHandle }
          : {}),
      };
    }
  }

  throw new WindowsBridgeError(
    "TARGET_REQUIRED",
    "A captured target window identifier is required",
    { operation: "replacePrompt" },
  );
}

const FOREGROUND_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PromptLiftForeground {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$handle = [PromptLiftForeground]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) { throw "No foreground window is available." }
$processId = [uint32]0
[void][PromptLiftForeground]::GetWindowThreadProcessId($handle, [ref]$processId)
$titleLength = [PromptLiftForeground]::GetWindowTextLength($handle)
$titleBuilder = New-Object System.Text.StringBuilder ($titleLength + 1)
[void][PromptLiftForeground]::GetWindowText($handle, $titleBuilder, $titleBuilder.Capacity)
[ordered]@{
    handle = $handle.ToInt64()
    title = $titleBuilder.ToString()
    processId = $processId
} | ConvertTo-Json -Compress
`;

const CAPTURE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PromptLiftNative {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetFocus();
    [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsChild(IntPtr parent, IntPtr child);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint sourceThreadId, uint targetThreadId, bool attach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int virtualKey);
    [StructLayout(LayoutKind.Sequential)] private struct INPUT { public uint type; public INPUTUNION data; }
    [StructLayout(LayoutKind.Explicit)] private struct INPUTUNION {
        [FieldOffset(0)] public MOUSEINPUT mouse;
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public HARDWAREINPUT hardware;
    }
    [StructLayout(LayoutKind.Sequential)] private struct MOUSEINPUT {
        public int dx, dy; public uint mouseData, flags, time; public UIntPtr extraInfo;
    }
    [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT {
        public ushort virtualKey, scanCode; public uint flags, time; public UIntPtr extraInfo;
    }
    [StructLayout(LayoutKind.Sequential)] private struct HARDWAREINPUT {
        public uint message; public ushort parameterLow, parameterHigh;
    }
    private static INPUT Key(ushort key, uint flags) {
        return new INPUT {
            type = 1,
            data = new INPUTUNION {
                keyboard = new KEYBDINPUT { virtualKey = key, flags = flags }
            }
        };
    }
    public static bool ModifiersReleased() {
        return (GetAsyncKeyState(0x10) & 0x8000) == 0
            && (GetAsyncKeyState(0x11) & 0x8000) == 0
            && (GetAsyncKeyState(0x12) & 0x8000) == 0;
    }
    public static void SendChord(byte key) {
        const uint keyUp = 0x0002;
        INPUT[] inputs = {
            Key(0x11, 0),
            Key(key, 0),
            Key(key, keyUp),
            Key(0x11, keyUp)
        };
        uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (sent != (uint)inputs.Length) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Keyboard input injection was incomplete.");
        }
    }
}
'@
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$rawInput = [Console]::In.ReadToEnd()
$payload = if ([string]::IsNullOrWhiteSpace($rawInput)) { [pscustomobject]@{} } else { $rawInput | ConvertFrom-Json }
$pattern = [string]$payload.targetWindowTitlePattern
$handle = [IntPtr]::Zero
if ($payload.handle) {
    $handle = [IntPtr][int64]$payload.handle
} else {
    $handle = [PromptLiftNative]::GetForegroundWindow()
}

if ([string]::IsNullOrWhiteSpace($pattern) -and -not $payload.handle -and $handle -ne [IntPtr]::Zero) {
    $titleLength = [PromptLiftNative]::GetWindowTextLength($handle)
    $titleBuilder = New-Object System.Text.StringBuilder ($titleLength + 1)
    [void][PromptLiftNative]::GetWindowText($handle, $titleBuilder, $titleBuilder.Capacity)
    if ($titleBuilder.ToString() -match '(?i)Prompt\s*(?:Lift|Pet)') {
        $knownTarget = Get-Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.MainWindowHandle -ne [IntPtr]::Zero -and
                -not [string]::IsNullOrEmpty($_.MainWindowTitle) -and
                $_.MainWindowTitle -match '(?i)Codex|Claude|ChatGPT|WeChat|WeCom|微信|企业微信'
            } |
            Select-Object -First 1
        if ($null -ne $knownTarget) {
            $handle = [IntPtr]$knownTarget.MainWindowHandle
        } else {
            throw "No external chat window is available for capture."
        }
    }
}

if (-not [string]::IsNullOrWhiteSpace($pattern)) {
    $candidate = Get-Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.MainWindowHandle -ne [IntPtr]::Zero -and
            -not [string]::IsNullOrEmpty($_.MainWindowTitle) -and
            $_.MainWindowTitle.IndexOf($pattern, [StringComparison]::OrdinalIgnoreCase) -ge 0
        } |
        Select-Object -First 1
    if ($null -eq $candidate) {
        throw "No target window matched the supplied title pattern."
    }
    $handle = [IntPtr]$candidate.MainWindowHandle
}

if ($handle -eq [IntPtr]::Zero) {
    throw "No foreground target window is available."
}
if (-not [PromptLiftNative]::IsWindow($handle)) {
    throw "The target window no longer exists."
}
if ($payload.processId) {
    $actualProcessId = [uint32]0
    [void][PromptLiftNative]::GetWindowThreadProcessId($handle, [ref]$actualProcessId)
    if ($actualProcessId -ne [uint32]$payload.processId) {
        throw "The target window identity changed before capture."
    }
}
$requestedFocusHandle = [IntPtr]::Zero
if ($payload.focusHandle) {
    $candidateFocusHandle = [IntPtr][int64]$payload.focusHandle
    if ([PromptLiftNative]::IsWindow($candidateFocusHandle) -and
        ($candidateFocusHandle -eq $handle -or [PromptLiftNative]::IsChild($handle, $candidateFocusHandle))) {
        $requestedFocusHandle = $candidateFocusHandle
    }
}
$foregroundProcessId = [uint32]0
$foregroundWindow = [PromptLiftNative]::GetForegroundWindow()
$foregroundThreadId = [PromptLiftNative]::GetWindowThreadProcessId($foregroundWindow, [ref]$foregroundProcessId)
$targetProcessId = [uint32]0
$targetThreadId = [PromptLiftNative]::GetWindowThreadProcessId($handle, [ref]$targetProcessId)
$currentThreadId = [PromptLiftNative]::GetCurrentThreadId()
$attachedThreads = @()
$focusHandle = [IntPtr]::Zero
try {
    foreach ($threadId in @($foregroundThreadId, $targetThreadId) | Select-Object -Unique) {
        if ($threadId -and $threadId -ne $currentThreadId) {
            if ([PromptLiftNative]::AttachThreadInput($currentThreadId, $threadId, $true)) {
                $attachedThreads += $threadId
            }
        }
    }
    [void][PromptLiftNative]::ShowWindow($handle, 9)
    [void][PromptLiftNative]::BringWindowToTop($handle)
    $activated = $false
    for ($attempt = 0; $attempt -lt 8; $attempt += 1) {
        [void][PromptLiftNative]::SetForegroundWindow($handle)
        if ($requestedFocusHandle -ne [IntPtr]::Zero) {
            [void][PromptLiftNative]::SetFocus($requestedFocusHandle)
        }
        Start-Sleep -Milliseconds 45
        if ([PromptLiftNative]::GetForegroundWindow() -eq $handle) {
            $candidateFocusHandle = [PromptLiftNative]::GetFocus()
            if ($candidateFocusHandle -ne [IntPtr]::Zero -and
                [PromptLiftNative]::IsWindow($candidateFocusHandle) -and
                ($candidateFocusHandle -eq $handle -or [PromptLiftNative]::IsChild($handle, $candidateFocusHandle))) {
                $focusHandle = $candidateFocusHandle
            }
            $activated = $true
            break
        }
    }
} finally {
    foreach ($threadId in $attachedThreads) {
        [void][PromptLiftNative]::AttachThreadInput($currentThreadId, $threadId, $false)
    }
}
if (-not $activated) {
    throw "The target window did not receive focus."
}
$modifierDeadline = [DateTime]::UtcNow.AddSeconds(2)
while (-not [PromptLiftNative]::ModifiersReleased()) {
    if ([DateTime]::UtcNow -ge $modifierDeadline) { throw "Modifier keys are still pressed." }
    Start-Sleep -Milliseconds 20
}
[PromptLiftNative]::SendChord(0x41)
Start-Sleep -Milliseconds 40
[PromptLiftNative]::SendChord(0x43)
Start-Sleep -Milliseconds 160
[PromptLiftNative]::SendChord(0x23)
Start-Sleep -Milliseconds 40

$processId = [uint32]0
[void][PromptLiftNative]::GetWindowThreadProcessId($handle, [ref]$processId)
$titleLength = [PromptLiftNative]::GetWindowTextLength($handle)
$titleBuilder = New-Object System.Text.StringBuilder ($titleLength + 1)
[void][PromptLiftNative]::GetWindowText($handle, $titleBuilder, $titleBuilder.Capacity)

[ordered]@{
    handle = $handle.ToInt64()
    title = $titleBuilder.ToString()
    processId = $processId
    focusHandle = $focusHandle.ToInt64()
} | ConvertTo-Json -Compress
`;

const REPLACE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PromptLiftNative {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetFocus();
    [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsChild(IntPtr parent, IntPtr child);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint sourceThreadId, uint targetThreadId, bool attach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int virtualKey);
    [StructLayout(LayoutKind.Sequential)] private struct INPUT { public uint type; public INPUTUNION data; }
    [StructLayout(LayoutKind.Explicit)] private struct INPUTUNION {
        [FieldOffset(0)] public MOUSEINPUT mouse;
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public HARDWAREINPUT hardware;
    }
    [StructLayout(LayoutKind.Sequential)] private struct MOUSEINPUT {
        public int dx, dy; public uint mouseData, flags, time; public UIntPtr extraInfo;
    }
    [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT {
        public ushort virtualKey, scanCode; public uint flags, time; public UIntPtr extraInfo;
    }
    [StructLayout(LayoutKind.Sequential)] private struct HARDWAREINPUT {
        public uint message; public ushort parameterLow, parameterHigh;
    }
    private static INPUT Key(ushort key, uint flags) {
        return new INPUT {
            type = 1,
            data = new INPUTUNION {
                keyboard = new KEYBDINPUT { virtualKey = key, flags = flags }
            }
        };
    }
    public static bool ModifiersReleased() {
        return (GetAsyncKeyState(0x10) & 0x8000) == 0
            && (GetAsyncKeyState(0x11) & 0x8000) == 0
            && (GetAsyncKeyState(0x12) & 0x8000) == 0;
    }
    public static void SendChord(byte key) {
        const uint keyUp = 0x0002;
        INPUT[] inputs = {
            Key(0x11, 0),
            Key(key, 0),
            Key(key, keyUp),
            Key(0x11, keyUp)
        };
        uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (sent != (uint)inputs.Length) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Keyboard input injection was incomplete.");
        }
    }
}
'@
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$rawInput = [Console]::In.ReadToEnd()
$payload = if ([string]::IsNullOrWhiteSpace($rawInput)) { [pscustomobject]@{} } else { $rawInput | ConvertFrom-Json }
$handleValue = [int64]$payload.handle
if ($handleValue -le 0) {
    throw "A valid target window handle is required."
}
$handle = [IntPtr]$handleValue
if (-not [PromptLiftNative]::IsWindow($handle)) {
    throw "The target window no longer exists."
}
if ($payload.processId) {
    $actualProcessId = [uint32]0
    [void][PromptLiftNative]::GetWindowThreadProcessId($handle, [ref]$actualProcessId)
    if ($actualProcessId -ne [uint32]$payload.processId) {
        throw "The target window identity changed before replacement."
    }
}
$focusHandle = [IntPtr]::Zero
if ($payload.focusHandle) {
    $candidateFocusHandle = [IntPtr][int64]$payload.focusHandle
    if ([PromptLiftNative]::IsWindow($candidateFocusHandle) -and
        ($candidateFocusHandle -eq $handle -or [PromptLiftNative]::IsChild($handle, $candidateFocusHandle))) {
        $focusHandle = $candidateFocusHandle
    }
}
$foregroundProcessId = [uint32]0
$foregroundWindow = [PromptLiftNative]::GetForegroundWindow()
$foregroundThreadId = [PromptLiftNative]::GetWindowThreadProcessId($foregroundWindow, [ref]$foregroundProcessId)
$targetProcessId = [uint32]0
$targetThreadId = [PromptLiftNative]::GetWindowThreadProcessId($handle, [ref]$targetProcessId)
$currentThreadId = [PromptLiftNative]::GetCurrentThreadId()
$attachedThreads = @()
try {
    foreach ($threadId in @($foregroundThreadId, $targetThreadId) | Select-Object -Unique) {
        if ($threadId -and $threadId -ne $currentThreadId) {
            if ([PromptLiftNative]::AttachThreadInput($currentThreadId, $threadId, $true)) {
                $attachedThreads += $threadId
            }
        }
    }
    [void][PromptLiftNative]::ShowWindow($handle, 9)
    [void][PromptLiftNative]::BringWindowToTop($handle)
    $activated = $false
    for ($attempt = 0; $attempt -lt 8; $attempt += 1) {
        [void][PromptLiftNative]::SetForegroundWindow($handle)
        if ($focusHandle -ne [IntPtr]::Zero) {
            [void][PromptLiftNative]::SetFocus($focusHandle)
        }
        Start-Sleep -Milliseconds 45
        if ([PromptLiftNative]::GetForegroundWindow() -eq $handle) {
            $activated = $true
            break
        }
    }
} finally {
    foreach ($threadId in $attachedThreads) {
        [void][PromptLiftNative]::AttachThreadInput($currentThreadId, $threadId, $false)
    }
}
if (-not $activated) {
    throw "The target window did not receive focus."
}
$modifierDeadline = [DateTime]::UtcNow.AddSeconds(2)
while (-not [PromptLiftNative]::ModifiersReleased()) {
    if ([DateTime]::UtcNow -ge $modifierDeadline) { throw "Modifier keys are still pressed." }
    Start-Sleep -Milliseconds 20
}
[PromptLiftNative]::SendChord(0x41)
Start-Sleep -Milliseconds 40
[PromptLiftNative]::SendChord(0x43)
Start-Sleep -Milliseconds 140
if ($null -ne $payload.expectedText) {
    $currentText = [Windows.Forms.Clipboard]::GetText()
    $normalizedCurrent = $currentText.Replace([string][char]13, [string]::Empty)
    $normalizedExpected = ([string]$payload.expectedText).Replace([string][char]13, [string]::Empty)
    if ($normalizedCurrent -cne $normalizedExpected) {
        throw "The target input changed after capture."
    }
}
[Windows.Forms.Clipboard]::SetText([string]$payload.replacementText)
Start-Sleep -Milliseconds 40
[PromptLiftNative]::SendChord(0x56)
Start-Sleep -Milliseconds 120
[ordered]@{ replaced = $true; handle = $handle.ToInt64() } | ConvertTo-Json -Compress
`;

/**
 * Create an isolated bridge. Supplying `runPowerShell` and `clipboard` makes
 * the module deterministic in tests and lets the Electron main process inject
 * its already-created clipboard adapter.
 */
export function createWindowsBridge({
  runPowerShell: injectedRunPowerShell,
  clipboard,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const runner = injectedRunPowerShell ?? runPowerShell;
  let lastTarget;

  async function invokePowerShell(script, input, operation) {
    try {
      const result = await withTimeout(
        () => runner(script, { input, timeoutMs }),
        operation,
        timeoutMs,
      );
      return getRunnerOutput(result);
    } catch (error) {
      if (error instanceof WindowsBridgeError) {
        throw error;
      }
      if (operation === "replacePrompt"
        && /target input changed after capture/i.test(error?.message ?? "")) {
        throw bridgeError(
          "TARGET_CONTENT_CHANGED",
          "The target input changed after capture; replacement was cancelled",
          operation,
          error,
        );
      }
      throw bridgeError(
        "POWERSHELL_FAILED",
        `${operation} failed`,
        operation,
        error,
      );
    }
  }

  return {
    async capturePrompt(targetWindowTitlePattern) {
      let titlePattern = "";
      let requestedTarget;
      if (typeof targetWindowTitlePattern === "string") {
        assertText(targetWindowTitlePattern, "targetWindowTitlePattern");
        titlePattern = targetWindowTitlePattern;
      } else if (targetWindowTitlePattern !== undefined && targetWindowTitlePattern !== null) {
        requestedTarget = normalizeTarget(targetWindowTitlePattern);
      }

      const previousClipboard = await readClipboard(clipboard, timeoutMs);
      const captureSentinel = `\u2063PROMPT_LIFT_CAPTURE_${Date.now()}_${Math.random().toString(16).slice(2)}\u2063`;
      let capturedText;
      let primaryError;
      try {
        await writeClipboard(clipboard, captureSentinel, timeoutMs);
        const rawTarget = await invokePowerShell(
          CAPTURE_SCRIPT,
          {
            targetWindowTitlePattern: titlePattern,
                ...(requestedTarget ? {
                  handle: requestedTarget.handle,
                  ...(requestedTarget.processId ? { processId: requestedTarget.processId } : {}),
                  ...(requestedTarget.focusHandle ? { focusHandle: requestedTarget.focusHandle } : {}),
                } : {}),
          },
          "capturePrompt",
        );
        const target = parseTarget(rawTarget);
        const text = await readClipboard(clipboard, timeoutMs);
        if (text === captureSentinel) {
          throw new WindowsBridgeError(
            "PROMPT_NOT_CAPTURED",
            "The target input did not provide any text. Focus the Codex or Claude input and try again.",
            { operation: "capturePrompt" },
          );
        }
        capturedText = text;
        lastTarget = target;
        return { text, target };
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        try {
          const currentClipboard = await readClipboard(clipboard, timeoutMs);
          const bridgeOwnedClipboard = normalizeComparableText(currentClipboard)
            === normalizeComparableText(captureSentinel)
            || (capturedText !== undefined
              && normalizeComparableText(currentClipboard)
                === normalizeComparableText(capturedText));
          if (bridgeOwnedClipboard) {
            await writeClipboard(clipboard, previousClipboard, timeoutMs);
          }
        } catch (restoreError) {
          if (!primaryError) {
            throw bridgeError(
              "CLIPBOARD_RESTORE_FAILED",
              "Prompt was captured but the previous clipboard could not be restored",
              "capturePrompt",
              restoreError,
            );
          }
        }
      }
    },

    async getForegroundTarget() {
      const rawTarget = await invokePowerShell(
        FOREGROUND_SCRIPT,
        {},
        "getForegroundTarget",
      );
      return parseTarget(rawTarget);
    },

    async replacePrompt(text, target, options = {}) {
      assertText(text, "text");
      const expectedText = options?.expectedText;
      if (expectedText !== undefined) {
        assertText(expectedText, "expectedText");
      }
      const resolvedTarget = normalizeTarget(target ?? lastTarget);
      const previousClipboard = await readClipboard(clipboard, timeoutMs);
      let rawResult;
      try {
        const maximumAttempts = expectedText === undefined ? 1 : 2;
        for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
          rawResult = await invokePowerShell(
            REPLACE_SCRIPT,
            {
              handle: resolvedTarget.handle,
              ...(resolvedTarget.processId ? { processId: resolvedTarget.processId } : {}),
              ...(resolvedTarget.focusHandle ? { focusHandle: resolvedTarget.focusHandle } : {}),
              ...(expectedText !== undefined ? { expectedText } : {}),
              replacementText: text,
            },
            "replacePrompt",
          );
          const verification = await this.capturePrompt(resolvedTarget);
          const observedText = normalizeComparableText(verification.text);
          if (observedText === normalizeComparableText(text)) {
            break;
          }

          const originalStillPresent = expectedText !== undefined
            && observedText === normalizeComparableText(expectedText);
          if (!originalStillPresent || attempt === maximumAttempts) {
            throw new WindowsBridgeError(
              "REPLACE_NOT_CONFIRMED",
              "The target input did not contain the enhanced text after replacement",
              {
                operation: "replacePrompt",
                details: {
                  handle: resolvedTarget.handle,
                  attempt,
                  observedState: originalStillPresent ? "original" : "unknown",
                },
              },
            );
          }
        }
      } finally {
        const currentClipboard = await readClipboard(clipboard, timeoutMs);
        const bridgeOwnedClipboard = normalizeComparableText(currentClipboard)
          === normalizeComparableText(text)
          || (expectedText !== undefined
            && normalizeComparableText(currentClipboard) === normalizeComparableText(expectedText));
        if (bridgeOwnedClipboard) {
          await writeClipboard(clipboard, previousClipboard, timeoutMs);
        }
      }
      return {
        ...resolvedTarget,
        replaced: getRunnerOutput(rawResult),
      };
    },

    async copyText(text) {
      assertText(text, "text");
      await writeClipboard(clipboard, text, timeoutMs);
      return { copied: true };
    },

    getLastTarget() {
      return lastTarget ? { ...lastTarget } : undefined;
    },
  };
}

function normalizeComparableText(value) {
  return String(value)
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\u00A0/gu, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/gu, ""))
    .join("\n")
    .replace(/\n+$/gu, "");
}

// Main-process compatibility exports. The factory remains the injectable seam;
// these wrappers let an Electron main process import the bridge directly.
const defaultBridge = createWindowsBridge();

export const capturePrompt = (...args) => defaultBridge.capturePrompt(...args);
export const getForegroundTarget = (...args) => defaultBridge.getForegroundTarget(...args);
export const replacePrompt = (...args) => defaultBridge.replacePrompt(...args);
export const copyText = (...args) => defaultBridge.copyText(...args);

export default createWindowsBridge;
