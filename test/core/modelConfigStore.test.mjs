import assert from "node:assert/strict";
import test from "node:test";

import { createEncryptedModelConfigStore } from "../../src/core/modelConfigStore.mjs";

function createSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, ""),
  };
}

test("model config store encrypts the API key and reloads it without returning plaintext to UI", async () => {
  let fileContents;
  let renamed;
  const store = createEncryptedModelConfigStore({
    userDataPath: "C:/PromptPetTest",
    safeStorage: createSafeStorage(),
    readFile: async () => fileContents,
    writeFile: async (_file, contents) => {
      fileContents = contents;
    },
    renameFile: async (temporary, target) => {
      renamed = { temporary, target };
    },
  });

  const saved = await store.save({
    endpoint: "https://example.test/v1",
    model: "test-model",
    style: "balanced",
    mode: "enhance",
    targetWindowTitlePattern: "Claude",
    apiKey: "secret-key",
  });
  assert.equal(saved.saved, true);
  assert.equal(Buffer.from(JSON.parse(fileContents).apiKey, "base64").toString("utf8"), "encrypted:secret-key");
  assert.doesNotMatch(fileContents, /"apiKey":"secret-key"/);
  assert.equal(renamed.target, store.configPath);

  const loaded = await store.load();
  assert.equal(loaded.apiKey, "secret-key");
  assert.equal(loaded.apiKeySaved, true);
  assert.equal(loaded.endpoint, "https://example.test/v1");
  assert.equal(loaded.targetWindowTitlePattern, "Claude");
});

test("model config store reports unavailable encryption without writing a key", async () => {
  const store = createEncryptedModelConfigStore({
    userDataPath: "C:/PromptPetTest",
    safeStorage: { isEncryptionAvailable: () => false },
    writeFile: async () => {
      throw new Error("must not write");
    },
  });

  const saved = await store.save({ apiKey: "secret-key" });
  assert.deepEqual(saved, { saved: false, storageAvailable: false, reason: "UNAVAILABLE" });
  const loaded = await store.load();
  assert.equal(loaded.apiKeySaved, false);
  assert.equal(loaded.storageAvailable, false);
});
