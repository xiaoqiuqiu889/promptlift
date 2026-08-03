import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  createWindowsDoubleAltListener,
  DOUBLE_ALT_SCRIPT,
} from "../../src/platform/windowsAltShortcut.mjs";

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.killCount = 0;
  }

  kill() {
    this.killCount += 1;
  }
}

test("double Alt listener starts a hidden PowerShell hook and emits one trigger per event", () => {
  const child = new FakeChild();
  let spawnArgs;
  let triggers = 0;
  const listener = createWindowsDoubleAltListener({
    platform: "win32",
    spawnProcess: (...args) => {
      spawnArgs = args;
      return child;
    },
    onTrigger: () => {
      triggers += 1;
    },
  });

  assert.equal(listener.start(), true);
  child.stdout.emit("data", "DOUBLE_");
  child.stdout.emit("data", "ALT\nDOUBLE_ALT\n");
  child.stdout.emit("data", "D\u0000O\u0000U\u0000B\u0000L\u0000E\u0000_\u0000A\u0000L\u0000T\u0000\n\u0000");
  assert.equal(triggers, 3);
  assert.equal(spawnArgs[0], "powershell.exe");
  assert.equal(spawnArgs[2].windowsHide, true);
  assert.ok(spawnArgs[1].includes("-EncodedCommand"));
  listener.stop();
  assert.equal(child.killCount, 1);
});

test("double Alt listener script uses a global low-level hook and does not consume the key", () => {
  assert.match(DOUBLE_ALT_SCRIPT, /SetWindowsHookEx/);
  assert.match(DOUBLE_ALT_SCRIPT, /VK_MENU/);
  assert.match(DOUBLE_ALT_SCRIPT, /WM_SYSKEYUP/);
  assert.match(DOUBLE_ALT_SCRIPT, /AltIsDown/);
  assert.match(DOUBLE_ALT_SCRIPT, /TriggerOnAltUp/);
  assert.match(DOUBLE_ALT_SCRIPT, /if \(TriggerOnAltUp\)/);
  assert.match(DOUBLE_ALT_SCRIPT, /DOUBLE_ALT/);
  assert.match(DOUBLE_ALT_SCRIPT, /CallNextHookEx/);
  assert.match(DOUBLE_ALT_SCRIPT, /GetTickCount/);
  assert.doesNotMatch(DOUBLE_ALT_SCRIPT, /TickCount64/);
  assert.match(DOUBLE_ALT_SCRIPT, /LastAltDown = 0/);
  assert.match(DOUBLE_ALT_SCRIPT, /virtualKey != VK_MENU/);
  assert.match(DOUBLE_ALT_SCRIPT, /virtualKey != VK_LMENU/);
  assert.match(DOUBLE_ALT_SCRIPT, /\[Console\]::OutputEncoding/);
  assert.match(DOUBLE_ALT_SCRIPT, /UTF8Encoding/);
});

test("real Windows double Alt listener remains alive after startup", {
  skip: process.platform !== "win32",
  timeout: 5_000,
}, async () => {
  const errors = [];
  const listener = createWindowsDoubleAltListener({
    onError: (error) => {
      errors.push(error);
    },
  });

  assert.equal(listener.start(), true);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  listener.stop();

  assert.deepEqual(errors, []);
});
