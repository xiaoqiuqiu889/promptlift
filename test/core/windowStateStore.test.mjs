import assert from "node:assert/strict";
import test from "node:test";

import { createWindowStateStore } from "../../src/core/windowStateStore.mjs";

test("window state store saves valid bounds atomically and reloads them", async () => {
  let contents;
  let rename;
  const store = createWindowStateStore({
    userDataPath: "C:/PromptPetTest",
    readFile: async () => contents,
    writeFile: async (_path, value) => {
      contents = value;
    },
    renameFile: async (source, target) => {
      rename = { source, target };
    },
  });

  const bounds = { x: -1200, y: 80, width: 144, height: 168 };
  assert.deepEqual(await store.save(bounds), { saved: true });
  assert.deepEqual(await store.load(), bounds);
  assert.equal(rename.target, store.statePath);
});

test("window state store ignores malformed or unreasonable persisted bounds", async () => {
  const store = createWindowStateStore({
    userDataPath: "C:/PromptPetTest",
    readFile: async () => JSON.stringify({
      x: 0,
      y: 0,
      width: 999999,
      height: 10,
    }),
  });

  assert.equal(await store.load(), undefined);
  await assert.rejects(
    store.save({ x: 0, y: 0, width: 0, height: 100 }),
    /valid window bounds/,
  );
});
