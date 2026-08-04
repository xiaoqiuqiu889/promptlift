import assert from "node:assert/strict";
import test from "node:test";

import { createGlobalShortcutController } from "../../src/core/globalShortcutController.mjs";

function createFixture({ rejected = new Set() } = {}) {
  const registered = new Set();
  const unregistered = [];
  const listeners = [];
  const globalShortcut = {
    register(accelerator) {
      if (rejected.has(accelerator)) {
        return false;
      }
      registered.add(accelerator);
      return true;
    },
    unregister(accelerator) {
      registered.delete(accelerator);
      unregistered.push(accelerator);
    },
    isRegistered(accelerator) {
      return registered.has(accelerator);
    },
  };
  const controller = createGlobalShortcutController({
    globalShortcut,
    createDoubleAltListener: () => {
      const listener = {
        running: false,
        stopCount: 0,
        start() {
          this.running = true;
          return true;
        },
        stop() {
          this.running = false;
          this.stopCount += 1;
        },
      };
      listeners.push(listener);
      return listener;
    },
    onTrigger: () => {},
  });
  return { controller, registered, unregistered, listeners };
}

test("shortcut controller switches from double Alt to a registered accelerator", () => {
  const fixture = createFixture();
  assert.equal(fixture.controller.activate("DoubleAlt").shortcut, "DoubleAlt");
  assert.equal(fixture.listeners[0].running, true);

  const result = fixture.controller.activate("Control+Alt+P");
  assert.equal(result.shortcut, "Control+Alt+P");
  assert.equal(fixture.registered.has("Control+Alt+P"), true);
  assert.equal(fixture.listeners[0].running, false);
});

test("shortcut conflict keeps the previous shortcut active", () => {
  const fixture = createFixture({ rejected: new Set(["Control+Alt+P"]) });
  fixture.controller.activate("DoubleAlt");

  assert.throws(
    () => fixture.controller.activate("Control+Alt+P"),
    (error) => error?.code === "SHORTCUT_CONFLICT",
  );
  assert.equal(fixture.controller.getActive().shortcut, "DoubleAlt");
  assert.equal(fixture.listeners[0].running, true);
});

test("shortcut controller registers the replacement before releasing the old accelerator", () => {
  const fixture = createFixture();
  fixture.controller.activate("Control+Alt+P");
  fixture.controller.activate("Control+Shift+Space");

  assert.equal(fixture.registered.has("Control+Alt+P"), false);
  assert.equal(fixture.registered.has("Control+Shift+Space"), true);
  assert.deepEqual(fixture.unregistered, ["Control+Alt+P"]);
  fixture.controller.stop();
  assert.equal(fixture.registered.size, 0);
});
