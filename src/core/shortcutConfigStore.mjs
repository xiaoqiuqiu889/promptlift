import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_SHORTCUT, normalizeShortcut } from "./shortcutConfig.mjs";

const CONFIG_FILE_NAME = "prompt-lift-shortcut.json";
const CONFIG_VERSION = 1;

function createStoragePath(userDataPath) {
  if (typeof userDataPath !== "string" || userDataPath.trim().length === 0) {
    throw new TypeError("userDataPath must be a non-empty string");
  }
  return path.join(userDataPath, CONFIG_FILE_NAME);
}

export function createShortcutConfigStore({
  userDataPath,
  defaultShortcut = DEFAULT_SHORTCUT,
  readFile = fs.readFile,
  writeFile = fs.writeFile,
  renameFile = fs.rename,
  removeFile = fs.rm,
} = {}) {
  const configPath = createStoragePath(userDataPath);
  const fallbackShortcut = normalizeShortcut(defaultShortcut, { fallbackToDefault: false });

  async function load() {
    try {
      const raw = await readFile(configPath, "utf8");
      const persisted = JSON.parse(raw);
      return { shortcut: normalizeShortcut(persisted?.shortcut, { fallbackToDefault: false }) };
    } catch (error) {
      if (error?.code === "ENOENT") {
        return { shortcut: fallbackShortcut };
      }
      return {
        shortcut: fallbackShortcut,
        loadError: "SHORTCUT_CONFIG_INVALID",
      };
    }
  }

  async function save(input) {
    const shortcut = normalizeShortcut(input, { fallbackToDefault: false });
    const payload = JSON.stringify({
      version: CONFIG_VERSION,
      shortcut,
    });
    const temporaryPath = `${configPath}.${process.pid}.tmp`;
    try {
      await writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
      await renameFile(temporaryPath, configPath);
      return { shortcut };
    } catch {
      try {
        await removeFile(temporaryPath, { force: true });
      } catch {
        // Keep the original write failure as the actionable result.
      }
      const error = new Error("快捷键设置无法保存，请检查当前用户目录权限。");
      error.code = "SHORTCUT_SAVE_FAILED";
      throw error;
    }
  }

  return Object.freeze({
    configPath,
    load,
    save,
  });
}
