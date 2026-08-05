import fs from "node:fs/promises";
import path from "node:path";

import {
  MAX_CUSTOM_SYSTEM_PROMPT_LENGTH,
  MODEL_STYLES,
  isPromptMode,
} from "./promptEnhancer.mjs";

export const SYSTEM_PROMPT_STORE_VERSION = 1;
const CONFIG_FILE_NAME = "prompt-lift-system-prompts.json";

const isCanonicalPair = (mode, style) => (
  isPromptMode(mode) && style === MODEL_STYLES.workbuddy
);

function createStoragePath(userDataPath) {
  if (typeof userDataPath !== "string" || userDataPath.trim().length === 0) {
    throw new TypeError("userDataPath must be a non-empty string");
  }
  return path.join(userDataPath, CONFIG_FILE_NAME);
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, MAX_CUSTOM_SYSTEM_PROMPT_LENGTH);
}

export function normalizeSystemPromptOverrides(overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(overrides)) {
    const [mode, style] = rawKey.split(":");
    const canonicalStyle = style === MODEL_STYLES.workbuddy ? style : null;
    const value = normalizeText(rawValue);
    if (!isCanonicalPair(mode, canonicalStyle) || !value) {
      continue;
    }
    normalized[`${mode}:${canonicalStyle}`] = value;
  }
  return normalized;
}

export function createSystemPromptStore({
  userDataPath,
  readFile = fs.readFile,
  writeFile = fs.writeFile,
  renameFile = fs.rename,
} = {}) {
  const configPath = createStoragePath(userDataPath);

  async function load() {
    try {
      const raw = await readFile(configPath, "utf8");
      const persisted = JSON.parse(raw);
      return {
        version: SYSTEM_PROMPT_STORE_VERSION,
        overrides: normalizeSystemPromptOverrides(persisted?.overrides),
      };
    } catch (error) {
      if (error?.code === "ENOENT") {
        return { version: SYSTEM_PROMPT_STORE_VERSION, overrides: {} };
      }
      return {
        version: SYSTEM_PROMPT_STORE_VERSION,
        overrides: {},
        loadError: "SYSTEM_PROMPT_STORE_LOAD_FAILED",
      };
    }
  }

  async function save(overrides = {}) {
    const normalized = normalizeSystemPromptOverrides(overrides);
    const payload = JSON.stringify({
      version: SYSTEM_PROMPT_STORE_VERSION,
      overrides: normalized,
    });
    const temporaryPath = `${configPath}.${process.pid}.tmp`;
    try {
      await writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
      await renameFile(temporaryPath, configPath);
      return { saved: true, count: Object.keys(normalized).length };
    } catch {
      try {
        await fs.rm(temporaryPath, { force: true });
      } catch {
        // Preserve the stable persistence result without exposing user text.
      }
      return { saved: false, count: Object.keys(normalized).length, reason: "WRITE_FAILED" };
    }
  }

  return Object.freeze({
    configPath,
    load,
    save,
  });
}
