import { spawn as defaultSpawn } from "node:child_process";

const DOUBLE_ALT_WINDOW_MS = 500;

export const DOUBLE_ALT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Windows.Forms.dll -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class PromptLiftAltHook {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const int VK_MENU = 0x12;
    private const int VK_LMENU = 0xA4;
    private const int VK_RMENU = 0xA5;
    private static readonly LowLevelKeyboardProc HookProc = HookCallback;
    private static IntPtr HookId = IntPtr.Zero;
    private static uint LastAltDown;
    private static bool AltIsDown;
    private static bool TriggerOnAltUp;

    public static int Run() {
        HookId = SetWindowsHookEx(
            WH_KEYBOARD_LL,
            HookProc,
            GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName),
            0);
        if (HookId == IntPtr.Zero) {
            return 2;
        }
        Application.Run();
        UnhookWindowsHookEx(HookId);
        return 0;
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            int virtualKey = Marshal.ReadInt32(lParam);
            bool isLeftAlt = virtualKey == VK_MENU || virtualKey == VK_LMENU;
            bool anyKeyDown = wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN;
            if (virtualKey != VK_MENU && virtualKey != VK_LMENU && virtualKey != VK_RMENU && anyKeyDown) {
                LastAltDown = 0;
                TriggerOnAltUp = false;
            }
            if (isLeftAlt) {
                bool keyDown = wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN;
                bool keyUp = wParam == (IntPtr)WM_KEYUP || wParam == (IntPtr)WM_SYSKEYUP;
                if (keyDown && !AltIsDown) {
                    uint now = GetTickCount();
                    if (LastAltDown > 0 && unchecked(now - LastAltDown) <= ${DOUBLE_ALT_WINDOW_MS}) {
                        TriggerOnAltUp = true;
                        LastAltDown = 0;
                    } else {
                        LastAltDown = now;
                    }
                    AltIsDown = true;
                } else if (keyUp) {
                    AltIsDown = false;
                    if (TriggerOnAltUp) {
                        TriggerOnAltUp = false;
                        Console.WriteLine("DOUBLE_ALT");
                        Console.Out.Flush();
                    }
                }
            }
        }
        return CallNextHookEx(HookId, nCode, wParam, lParam);
    }

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc callback, IntPtr hMod, uint threadId);
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hookId);
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hookId, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string moduleName);
    [DllImport("kernel32.dll")]
    private static extern uint GetTickCount();
}
'@
[PromptLiftAltHook]::Run()
`;

function parseLines(buffer, onLine) {
  const lines = buffer.split(/\r?\n/);
  return { remainder: lines.pop() ?? "", lines: lines.filter(Boolean).map((line) => onLine(line)) };
}

export function createWindowsDoubleAltListener({
  spawnProcess = defaultSpawn,
  platform = process.platform,
  onTrigger = () => {},
  onError = () => {},
} = {}) {
  let child;
  let outputBuffer = "";
  let errorBuffer = "";

  function start() {
    if (platform !== "win32" || child) {
      return false;
    }
    child = spawnProcess(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(DOUBLE_ALT_SCRIPT, "utf16le").toString("base64")],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    outputBuffer = "";
    errorBuffer = "";
    child.stdout?.setEncoding?.("utf8");
    child.stderr?.setEncoding?.("utf8");
    child.stderr?.on?.("data", (chunk) => {
      errorBuffer = (errorBuffer + String(chunk)).slice(-4_000);
    });
    child.stdout?.on?.("data", (chunk) => {
      outputBuffer += String(chunk);
      const parsed = parseLines(outputBuffer, (line) => {
        if (line.replace(/\u0000/g, "").trim() === "DOUBLE_ALT") {
          onTrigger();
        }
        return line;
      });
      outputBuffer = parsed.remainder;
    });
    child.on?.("error", (error) => {
      child = undefined;
      onError(error);
    });
    child.on?.("close", (code) => {
      if (child) {
        child = undefined;
        if (code !== 0) {
          const detail = errorBuffer.trim();
          onError(new Error(
            `Double Alt listener exited with code ${code}${detail ? `: ${detail}` : ""}`,
          ));
        }
      }
    });
    return true;
  }

  function stop() {
    if (!child) {
      return;
    }
    const current = child;
    child = undefined;
    current.kill?.();
  }

  return Object.freeze({ start, stop });
}
