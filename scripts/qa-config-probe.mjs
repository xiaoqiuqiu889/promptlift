import path from "node:path";
import fs from "node:fs/promises";

import { app, safeStorage } from "electron";

import { createEncryptedModelConfigStore } from "../src/core/modelConfigStore.mjs";

function parseUserDataArgument() {
  const prefix = "--qa-user-data=";
  const raw = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  if (!raw) {
    throw new Error("Missing --qa-user-data");
  }
  return path.resolve(raw);
}

function parseResultFileArgument() {
  const prefix = "--result-file=";
  const raw = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  if (!raw) {
    throw new Error("Missing --result-file");
  }
  return path.resolve(raw);
}

async function run() {
  const userDataPath = parseUserDataArgument();
  const resultFile = parseResultFileArgument();
  app.setPath("userData", userDataPath);
  await fs.writeFile(resultFile, `${JSON.stringify({ stage: "waiting-for-ready" })}\n`, "utf8");

  await app.whenReady();

  const store = createEncryptedModelConfigStore({
    userDataPath: app.getPath("userData"),
    safeStorage,
  });
  const loaded = await store.load();

  const result = {
    stage: "loaded",
    userDataMatched: path.resolve(app.getPath("userData")) === userDataPath,
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    apiKeySaved: loaded.apiKeySaved === true,
    apiKeyCharacters: typeof loaded.apiKey === "string" ? loaded.apiKey.length : 0,
    loadError: loaded.loadError ?? null,
  };
  await fs.writeFile(resultFile, `${JSON.stringify(result)}\n`, "utf8");
  app.quit();
}

run().catch(async (error) => {
  const prefix = "--result-file=";
  const rawResultFile = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  if (rawResultFile) {
    await fs.writeFile(path.resolve(rawResultFile), `${JSON.stringify({
      stage: "failed",
      errorCode: error?.code ?? null,
      errorMessage: error instanceof Error ? error.message : String(error),
    })}\n`, "utf8").catch(() => {});
  }
  app.exit(1);
});
