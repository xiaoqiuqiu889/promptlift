import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TEXT_LENGTH = 1_000_000;

const JXA_STDIN = String.raw`
ObjC.import("Foundation");
function readInput() {
  const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  const text = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
  return JSON.parse(ObjC.unwrap(text) || "{}");
}
function targetFromProcess(process) {
  let bundleId = "";
  try { bundleId = process.bundleIdentifier(); } catch {}
  const processId = Number(process.unixId());
  return {
    handle: processId,
    processId,
    title: String(process.name()),
    bundleId: String(bundleId || "")
  };
}
`;

export const MAC_FOREGROUND_SCRIPT = String.raw`
${JXA_STDIN}
const systemEvents = Application("System Events");
const processes = systemEvents.applicationProcesses.whose({ frontmost: true })();
if (!processes.length) throw new Error("No foreground application");
JSON.stringify(targetFromProcess(processes[0]));
`;

export const MAC_CAPTURE_SCRIPT = String.raw`
${JXA_STDIN}
const input = readInput();
const systemEvents = Application("System Events");
const matches = systemEvents.applicationProcesses.whose({ unixId: Number(input.processId) })();
if (!matches.length) throw new Error("Target application is no longer running");
const process = matches[0];
process.frontmost = true;
delay(0.08);
systemEvents.keystroke("a", { using: "command down" });
delay(0.04);
systemEvents.keystroke("c", { using: "command down" });
delay(0.12);
JSON.stringify(targetFromProcess(process));
`;

export const MAC_REPLACE_SCRIPT = String.raw`
${JXA_STDIN}
const input = readInput();
const systemEvents = Application("System Events");
const matches = systemEvents.applicationProcesses.whose({ unixId: Number(input.processId) })();
if (!matches.length) throw new Error("Target application is no longer running");
const process = matches[0];
process.frontmost = true;
delay(0.08);
systemEvents.keystroke("a", { using: "command down" });
delay(0.04);
systemEvents.keystroke("v", { using: "command down" });
delay(0.12);
JSON.stringify(targetFromProcess(process));
`;

export class MacBridgeError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "MacBridgeError";
    this.code = code;
    this.operation = options.operation ?? "mac-bridge";
    this.details = options.details;
  }
}

function assertText(value, field, { allowEmpty = true } = {}) {
  if (typeof value !== "string") {
    throw new MacBridgeError("INVALID_TEXT", `${field} must be a string`, {
      operation: field,
    });
  }
  if (!allowEmpty && value.trim().length === 0) {
    throw new MacBridgeError("EMPTY_TEXT", `${field} must not be empty`, {
      operation: field,
    });
  }
  if (value.length > MAX_TEXT_LENGTH) {
    throw new MacBridgeError("TEXT_TOO_LARGE", `${field} is too large`, {
      operation: field,
      details: { maxLength: MAX_TEXT_LENGTH },
    });
  }
  return value;
}

function normalizeTarget(target) {
  const processId = Number(target?.processId ?? target?.handle);
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new MacBridgeError("TARGET_INVALID", "Target application is invalid", {
      operation: "target",
    });
  }
  return {
    handle: processId,
    processId,
    title: typeof target?.title === "string" ? target.title : "",
    ...(typeof target?.bundleId === "string" && target.bundleId
      ? { bundleId: target.bundleId }
      : {}),
  };
}

function parseTarget(raw, operation) {
  try {
    return normalizeTarget(JSON.parse(String(raw).trim()));
  } catch (error) {
    if (error instanceof MacBridgeError) {
      throw error;
    }
    throw new MacBridgeError("TARGET_INVALID", "macOS returned an invalid target", {
      operation,
      cause: error,
    });
  }
}

function mapScriptError(error, operation) {
  if (error instanceof MacBridgeError) {
    return error;
  }
  const message = String(error?.message ?? error);
  if (/-1743|not allowed to send keystrokes|Not authorized/u.test(message)) {
    return new MacBridgeError(
      "MACOS_ACCESSIBILITY_REQUIRED",
      "请在“系统设置 → 隐私与安全性 → 辅助功能”中允许 Prompt Lift 控制键盘。",
      { operation, cause: error },
    );
  }
  return new MacBridgeError("MACOS_AUTOMATION_FAILED", "macOS 输入操作失败。", {
    operation,
    cause: error,
  });
}

function runProcess(command, args, { input = "", timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new MacBridgeError("BRIDGE_TIMEOUT", "macOS 输入操作超时。")));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => finish(() => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8") || `${command} exited ${code}`));
    }));
    child.stdin.end(input);
  });
}

function createSystemClipboard() {
  return Object.freeze({
    readText: () => runProcess("/usr/bin/pbpaste", []),
    writeText: (text) => runProcess("/usr/bin/pbcopy", [], { input: text }),
  });
}

async function defaultRunScript(script, { input = "" } = {}) {
  return runProcess("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], { input });
}

export function createMacBridge({
  clipboard = createSystemClipboard(),
  runScript = defaultRunScript,
  platform = process.platform,
} = {}) {
  function assertPlatform(operation) {
    if (platform !== "darwin") {
      throw new MacBridgeError(
        "PLATFORM_UNSUPPORTED",
        "macOS bridge is only available on macOS",
        { operation },
      );
    }
  }

  async function runTargetScript(script, target, operation) {
    try {
      const output = await runScript(script, {
        input: JSON.stringify({ processId: target.processId }),
      });
      const liveTarget = parseTarget(output, operation);
      if (liveTarget.processId !== target.processId) {
        throw new MacBridgeError("TARGET_CHANGED", "Target application changed", {
          operation,
        });
      }
      return liveTarget;
    } catch (error) {
      throw mapScriptError(error, operation);
    }
  }

  async function restoreClipboard(previous, ownedValues) {
    const current = await clipboard.readText();
    if (ownedValues.includes(current)) {
      await clipboard.writeText(previous);
    }
  }

  async function getForegroundTarget() {
    assertPlatform("foreground-target");
    try {
      return parseTarget(await runScript(MAC_FOREGROUND_SCRIPT, {
        input: "{}",
      }), "foreground-target");
    } catch (error) {
      throw mapScriptError(error, "foreground-target");
    }
  }

  async function capturePrompt(targetInput) {
    assertPlatform("capture");
    const target = normalizeTarget(targetInput ?? await getForegroundTarget());
    const previousClipboard = await clipboard.readText();
    const sentinel = `__PROMPT_LIFT_MAC_CAPTURE_${Date.now()}_${Math.random()}__`;
    await clipboard.writeText(sentinel);
    let captured = sentinel;
    try {
      const liveTarget = await runTargetScript(MAC_CAPTURE_SCRIPT, target, "capture");
      captured = assertText(await clipboard.readText(), "capturedText", { allowEmpty: false });
      if (captured === sentinel) {
        throw new MacBridgeError("CAPTURE_FAILED", "未能从目标输入框读取文本。", {
          operation: "capture",
        });
      }
      return { text: captured, target: liveTarget };
    } finally {
      await restoreClipboard(previousClipboard, [sentinel, captured]);
    }
  }

  async function replacePrompt(textInput, targetInput, { expectedText } = {}) {
    assertPlatform("replace");
    const text = assertText(textInput, "replacementText", { allowEmpty: false });
    const target = normalizeTarget(targetInput);
    if (typeof expectedText === "string") {
      const current = await capturePrompt(target);
      if (current.text !== expectedText) {
        throw new MacBridgeError(
          "TARGET_CONTENT_CHANGED",
          "目标输入框内容已经改变，未执行替换。",
          { operation: "replace" },
        );
      }
    }

    const previousClipboard = await clipboard.readText();
    await clipboard.writeText(text);
    try {
      await runTargetScript(MAC_REPLACE_SCRIPT, target, "replace");
      const verified = await capturePrompt(target);
      if (verified.text !== text) {
        throw new MacBridgeError("REPLACEMENT_VERIFICATION_FAILED", "替换结果校验失败。", {
          operation: "replace",
        });
      }
      return { replaced: true, target: verified.target };
    } finally {
      await restoreClipboard(previousClipboard, [text]);
    }
  }

  async function copyText(textInput) {
    assertPlatform("copy");
    await clipboard.writeText(assertText(textInput, "copyText"));
    return { copied: true };
  }

  return Object.freeze({
    capturePrompt,
    copyText,
    getForegroundTarget,
    replacePrompt,
  });
}

const defaultBridge = createMacBridge();
export const capturePrompt = defaultBridge.capturePrompt;
export const copyText = defaultBridge.copyText;
export const getForegroundTarget = defaultBridge.getForegroundTarget;
export const replacePrompt = defaultBridge.replacePrompt;
