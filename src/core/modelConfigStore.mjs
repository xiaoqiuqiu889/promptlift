import fs from "node:fs/promises";
import path from "node:path";

const CONFIG_FILE_NAME = "prompt-lift-model.json";
const CONFIG_VERSION = 1;

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function createStoragePath(userDataPath) {
  if (typeof userDataPath !== "string" || userDataPath.trim().length === 0) {
    throw new TypeError("userDataPath must be a non-empty string");
  }
  return path.join(userDataPath, CONFIG_FILE_NAME);
}

export function createEncryptedModelConfigStore({
  userDataPath,
  safeStorage,
  readFile = fs.readFile,
  writeFile = fs.writeFile,
  renameFile = fs.rename,
} = {}) {
  const configPath = createStoragePath(userDataPath);

  async function load() {
    try {
      const raw = await readFile(configPath, "utf8");
      const persisted = JSON.parse(raw);
      let apiKey = "";
      if (typeof persisted?.apiKey === "string" && persisted.apiKey.length > 0) {
        if (!safeStorage?.isEncryptionAvailable?.()) {
          return { apiKeySaved: false, storageAvailable: false };
        }
        apiKey = safeStorage.decryptString(Buffer.from(persisted.apiKey, "base64"));
      }
      return {
        endpoint: safeString(persisted?.endpoint),
        model: safeString(persisted?.model),
        style: safeString(persisted?.style),
        mode: safeString(persisted?.mode),
        targetWindowTitlePattern: safeString(persisted?.targetWindowTitlePattern),
        apiKey,
        apiKeySaved: apiKey.length > 0,
        storageAvailable: true,
      };
    } catch (error) {
      if (error?.code === "ENOENT") {
        return { apiKeySaved: false, storageAvailable: safeStorage?.isEncryptionAvailable?.() === true };
      }
      return {
        apiKeySaved: false,
        storageAvailable: safeStorage?.isEncryptionAvailable?.() === true,
        loadError: "MODEL_CONFIG_LOAD_FAILED",
      };
    }
  }

  async function save(config = {}) {
    if (!safeStorage?.isEncryptionAvailable?.()) {
      return { saved: false, storageAvailable: false, reason: "UNAVAILABLE" };
    }
    const apiKey = safeString(config.apiKey).trim();
    if (!apiKey) {
      return { saved: false, storageAvailable: true, reason: "NO_KEY" };
    }

    let encryptedKey;
    try {
      encryptedKey = safeStorage.encryptString(apiKey).toString("base64");
    } catch {
      return { saved: false, storageAvailable: true, reason: "ENCRYPT_FAILED" };
    }
    const payload = JSON.stringify({
      version: CONFIG_VERSION,
      endpoint: safeString(config.endpoint),
      model: safeString(config.model),
      style: safeString(config.style),
      mode: safeString(config.mode),
      targetWindowTitlePattern: safeString(config.targetWindowTitlePattern),
      apiKey: encryptedKey,
    });
    const temporaryPath = `${configPath}.${process.pid}.tmp`;
    try {
      await writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
      await renameFile(temporaryPath, configPath);
      return { saved: true, storageAvailable: true };
    } catch {
      try {
        await fs.rm(temporaryPath, { force: true });
      } catch {
        // Do not hide the original persistence result or expose key material.
      }
      return { saved: false, storageAvailable: true, reason: "WRITE_FAILED" };
    }
  }

  return Object.freeze({
    configPath,
    load,
    save,
  });
}
