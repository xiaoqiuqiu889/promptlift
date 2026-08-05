import assert from "node:assert/strict";
import test from "node:test";

import { createShortcutConfigStore } from "../../src/core/shortcutConfigStore.mjs";

test("shortcut store atomically saves and reloads a shortcut preference", async () => {
  let fileContents;
  let renamed;
  const store = createShortcutConfigStore({
    userDataPath: "C:/PromptLiftShortcutTest",
    readFile: async () => fileContents,
    writeFile: async (_file, contents) => {
      fileContents = contents;
    },
    renameFile: async (temporary, target) => {
      renamed = { temporary, target };
    },
  });

  const saved = await store.save("Control+Alt+P");
  assert.equal(saved.shortcut, "Control+Alt+P");
  assert.equal(renamed.target, store.configPath);
  assert.equal(JSON.parse(fileContents).shortcut, "Control+Alt+P");

  const loaded = await store.load();
  assert.equal(loaded.shortcut, "Control+Alt+P");
});

test("shortcut store falls back to double Alt for missing or invalid data", async () => {
  const missing = createShortcutConfigStore({
    userDataPath: "C:/PromptLiftShortcutTest",
    readFile: async () => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    },
  });
  assert.equal((await missing.load()).shortcut, "DoubleAlt");

  const invalid = createShortcutConfigStore({
    userDataPath: "C:/PromptLiftShortcutTest",
    readFile: async () => JSON.stringify({ shortcut: "Alt+P" }),
  });
  const loaded = await invalid.load();
  assert.equal(loaded.shortcut, "DoubleAlt");
  assert.equal(loaded.loadError, "SHORTCUT_CONFIG_INVALID");
});

test("shortcut store accepts a platform-specific default", async () => {
  const store = createShortcutConfigStore({
    userDataPath: "/tmp/PromptLiftShortcutTest",
    defaultShortcut: "Shift+Super+P",
    readFile: async () => {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    },
  });

  assert.equal((await store.load()).shortcut, "Shift+Super+P");
});
