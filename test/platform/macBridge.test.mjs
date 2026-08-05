import assert from "node:assert/strict";
import test from "node:test";

import {
  MAC_CAPTURE_SCRIPT,
  MAC_FOREGROUND_SCRIPT,
  MAC_REPLACE_SCRIPT,
  MacBridgeError,
  createMacBridge,
} from "../../src/platform/macBridge.mjs";

function createClipboard(initialText = "") {
  let text = initialText;
  return {
    readText: async () => text,
    writeText: async (value) => {
      text = value;
    },
  };
}

test("mac bridge captures and replaces text while preserving the user's clipboard", async () => {
  const clipboard = createClipboard("用户自己的剪贴板");
  let applicationText = "请评估这项建议";
  const target = {
    handle: 42,
    processId: 42,
    title: "Codex",
    bundleId: "com.openai.codex",
  };
  const runScript = async (script, { input } = {}) => {
    const payload = JSON.parse(input || "{}");
    if (script === MAC_FOREGROUND_SCRIPT) {
      return JSON.stringify(target);
    }
    if (script === MAC_CAPTURE_SCRIPT) {
      assert.equal(payload.processId, target.processId);
      await clipboard.writeText(applicationText);
      return JSON.stringify(target);
    }
    if (script === MAC_REPLACE_SCRIPT) {
      assert.equal(payload.processId, target.processId);
      applicationText = await clipboard.readText();
      return JSON.stringify(target);
    }
    throw new Error("unexpected script");
  };
  const bridge = createMacBridge({ clipboard, runScript, platform: "darwin" });

  assert.deepEqual(await bridge.getForegroundTarget(), target);
  const captured = await bridge.capturePrompt(target);
  assert.equal(captured.text, "请评估这项建议");
  assert.deepEqual(captured.target, target);
  assert.equal(await clipboard.readText(), "用户自己的剪贴板");

  const replaced = await bridge.replacePrompt(
    "直接评估这项建议是否值得采纳",
    target,
    { expectedText: "请评估这项建议" },
  );
  assert.equal(replaced.replaced, true);
  assert.equal(applicationText, "直接评估这项建议是否值得采纳");
  assert.equal(await clipboard.readText(), "用户自己的剪贴板");
});

test("mac bridge refuses replacement when the live target text changed", async () => {
  const clipboard = createClipboard("clipboard");
  const target = { handle: 7, processId: 7, title: "Claude" };
  const runScript = async (script) => {
    if (script === MAC_CAPTURE_SCRIPT) {
      await clipboard.writeText("用户已修改");
    }
    return JSON.stringify(target);
  };
  const bridge = createMacBridge({ clipboard, runScript, platform: "darwin" });

  await assert.rejects(
    bridge.replacePrompt("新文本", target, { expectedText: "旧文本" }),
    (error) => error instanceof MacBridgeError && error.code === "TARGET_CONTENT_CHANGED",
  );
  assert.equal(await clipboard.readText(), "clipboard");
});

test("mac bridge reports Accessibility permission failures", async () => {
  const bridge = createMacBridge({
    clipboard: createClipboard(),
    platform: "darwin",
    runScript: async () => {
      throw new Error("System Events is not allowed to send keystrokes. (-1743)");
    },
  });

  await assert.rejects(
    bridge.capturePrompt({ handle: 9, processId: 9, title: "Codex" }),
    (error) => error.code === "MACOS_ACCESSIBILITY_REQUIRED",
  );
});

test("mac bridge is explicitly unavailable outside macOS", async () => {
  const bridge = createMacBridge({
    clipboard: createClipboard(),
    platform: "win32",
    runScript: async () => "{}",
  });
  await assert.rejects(
    bridge.getForegroundTarget(),
    (error) => error.code === "PLATFORM_UNSUPPORTED",
  );
});

test("mac bridge copies plain text and validates target and replacement inputs", async () => {
  const clipboard = createClipboard();
  const bridge = createMacBridge({
    clipboard,
    platform: "darwin",
    runScript: async () => "{}",
  });

  assert.deepEqual(await bridge.copyText("可手动粘贴"), { copied: true });
  assert.equal(await clipboard.readText(), "可手动粘贴");
  await assert.rejects(
    bridge.capturePrompt({ processId: 0 }),
    (error) => error.code === "TARGET_INVALID",
  );
  await assert.rejects(
    bridge.replacePrompt("   ", { processId: 1 }),
    (error) => error.code === "EMPTY_TEXT",
  );
});

test("mac bridge rejects a capture when Command-C did not take ownership", async () => {
  const clipboard = createClipboard("clipboard");
  const bridge = createMacBridge({
    clipboard,
    platform: "darwin",
    runScript: async (_script, { input }) => JSON.stringify({
      handle: JSON.parse(input).processId,
      processId: JSON.parse(input).processId,
      title: "Codex",
    }),
  });

  await assert.rejects(
    bridge.capturePrompt({ processId: 11, title: "Codex" }),
    (error) => error.code === "CAPTURE_FAILED",
  );
  assert.equal(await clipboard.readText(), "clipboard");
});

test("mac bridge rejects a different process returned by System Events", async () => {
  const clipboard = createClipboard("clipboard");
  const bridge = createMacBridge({
    clipboard,
    platform: "darwin",
    runScript: async () => JSON.stringify({
      handle: 99,
      processId: 99,
      title: "Other",
    }),
  });

  await assert.rejects(
    bridge.capturePrompt({ processId: 12, title: "Codex" }),
    (error) => error.code === "TARGET_CHANGED",
  );
});

test("mac bridge maps ordinary System Events failures without leaking script details", async () => {
  const bridge = createMacBridge({
    clipboard: createClipboard(),
    platform: "darwin",
    runScript: async () => {
      throw new Error("private automation detail");
    },
  });

  await assert.rejects(
    bridge.getForegroundTarget(),
    (error) => (
      error.code === "MACOS_AUTOMATION_FAILED"
      && error.message === "macOS 输入操作失败。"
    ),
  );
});
