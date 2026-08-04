import assert from "node:assert/strict";
import test from "node:test";

import {
  createSystemPromptStore,
  normalizeSystemPromptOverrides,
} from "../../src/core/systemPromptStore.mjs";

test("system prompt overrides persist only WorkBuddy rules and discard retired tiers", async () => {
  let fileContents;
  let renamed;
  const store = createSystemPromptStore({
    userDataPath: "C:/PromptPetTest",
    readFile: async () => fileContents,
    writeFile: async (_file, contents) => {
      fileContents = contents;
    },
    renameFile: async (temporary, target) => {
      renamed = { temporary, target };
    },
  });

  const saved = await store.save({
    "enhance:workbuddy": "优先给出可执行结论。",
    "chat-polish:workbuddy": "不要改变称谓。",
    "enhance:creative": "retired tier must be discarded",
    "unknown:creative": "must be discarded",
  });
  assert.equal(saved.saved, true);
  assert.equal(renamed.target, store.configPath);
  assert.doesNotMatch(fileContents, /(?:unknown:creative|enhance:creative)/);

  const loaded = await store.load();
  assert.deepEqual(loaded.overrides, {
    "enhance:workbuddy": "优先给出可执行结论。",
    "chat-polish:workbuddy": "不要改变称谓。",
  });
});

test("system prompt override normalization bounds text and removes blank values", () => {
  const result = normalizeSystemPromptOverrides({
    "enhance:workbuddy": "  保留关键数字。  ",
    "upward-communication:workbuddy": "x".repeat(10_000),
    "ppt-copy:creative": "retired",
    "invalid": "ignore",
  });
  assert.equal(result["enhance:workbuddy"], "保留关键数字。");
  assert.equal(result["upward-communication:workbuddy"].length, 6_000);
  assert.equal(Object.hasOwn(result, "ppt-copy:creative"), false);
  assert.equal(Object.hasOwn(result, "invalid"), false);
});

test("WorkBuddy supplements persist independently for every scene", () => {
  const result = normalizeSystemPromptOverrides({
    "enhance:workbuddy": "Keep the request focused.",
    "upward-communication:workbuddy": "Lead with the decision.",
    "chat-polish:workbuddy": "Keep the response polite.",
    "ppt-copy:workbuddy": "Use one slide claim.",
  });

  assert.deepEqual(result, {
    "enhance:workbuddy": "Keep the request focused.",
    "upward-communication:workbuddy": "Lead with the decision.",
    "chat-polish:workbuddy": "Keep the response polite.",
    "ppt-copy:workbuddy": "Use one slide claim.",
  });
});

test("system prompt store rejects an invalid user data path", () => {
  assert.throws(() => createSystemPromptStore({ userDataPath: "" }), /userDataPath/);
  assert.deepEqual(normalizeSystemPromptOverrides(null), {});
  assert.deepEqual(normalizeSystemPromptOverrides([]), {});
  assert.deepEqual(normalizeSystemPromptOverrides("not-an-object"), {});
});

test("system prompt store handles missing and malformed persisted files conservatively", async () => {
  const missing = createSystemPromptStore({
    userDataPath: "C:/PromptPetMissing",
    readFile: async () => {
      const error = new Error("not found");
      error.code = "ENOENT";
      throw error;
    },
  });
  assert.deepEqual(await missing.load(), { version: 1, overrides: {} });

  const malformed = createSystemPromptStore({
    userDataPath: "C:/PromptPetMalformed",
    readFile: async () => "{not-json",
  });
  assert.deepEqual(await malformed.load(), {
    version: 1,
    overrides: {},
    loadError: "SYSTEM_PROMPT_STORE_LOAD_FAILED",
  });
});

test("system prompt store reports atomic save failures without leaking prompt text", async () => {
  const store = createSystemPromptStore({
    userDataPath: "C:/PromptPetSaveFailure",
    writeFile: async () => {
      throw new Error("disk full: secret prompt text");
    },
    renameFile: async () => {
      throw new Error("rename should not run");
    },
  });
  const result = await store.save({ "enhance:workbuddy": "private rule" });
  assert.deepEqual(result, { saved: false, count: 1, reason: "WRITE_FAILED" });
});
