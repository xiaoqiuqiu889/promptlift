import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SHORTCUT,
  MACOS_DEFAULT_SHORTCUT,
  defaultShortcutForPlatform,
  normalizeShortcut,
  shortcutDisplayLabel,
} from "../../src/core/shortcutConfig.mjs";

test("shortcut config preserves double Alt as the default", () => {
  assert.equal(DEFAULT_SHORTCUT, "DoubleAlt");
  assert.equal(normalizeShortcut(undefined), DEFAULT_SHORTCUT);
  assert.equal(normalizeShortcut("double-alt"), DEFAULT_SHORTCUT);
  assert.equal(shortcutDisplayLabel(DEFAULT_SHORTCUT), "双击左 Alt");
});

test("macOS defaults to a Command shortcut and renders native modifier symbols", () => {
  assert.equal(MACOS_DEFAULT_SHORTCUT, "Shift+Super+P");
  assert.equal(defaultShortcutForPlatform("darwin"), MACOS_DEFAULT_SHORTCUT);
  assert.equal(defaultShortcutForPlatform("win32"), DEFAULT_SHORTCUT);
  assert.equal(
    shortcutDisplayLabel(MACOS_DEFAULT_SHORTCUT, { platform: "darwin" }),
    "⌘⇧P",
  );
});

test("shortcut config canonicalizes safe Windows accelerator combinations", () => {
  assert.equal(normalizeShortcut("ctrl+alt+p"), "Control+Alt+P");
  assert.equal(normalizeShortcut("Shift+Ctrl+Space"), "Control+Shift+Space");
  assert.equal(normalizeShortcut("alt+control+shift+f12"), "Control+Alt+Shift+F12");
  assert.equal(shortcutDisplayLabel("Control+Alt+P"), "Ctrl + Alt + P");
});

test("shortcut config rejects single-modifier, modifier-only, and unsupported combinations", () => {
  for (const value of [
    "Alt+P",
    "Control+P",
    "Control+Alt",
    "Control+Alt+Delete",
    "Control+Alt+Tab",
    "Control+Alt+ArrowUp",
    "Control+Control+P",
    "not-a-shortcut",
  ]) {
    assert.throws(
      () => normalizeShortcut(value, { fallbackToDefault: false }),
      (error) => error?.code === "SHORTCUT_INVALID",
      value,
    );
  }
});
