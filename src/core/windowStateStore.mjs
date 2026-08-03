import fs from "node:fs/promises";
import path from "node:path";

const FILE_NAME = "prompt-lift-window.json";

function normalizeBounds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const bounds = {
    x: Number(value.x),
    y: Number(value.y),
    width: Number(value.width),
    height: Number(value.height),
  };
  if (!Object.values(bounds).every(Number.isSafeInteger)
    || Math.abs(bounds.x) > 100_000
    || Math.abs(bounds.y) > 100_000
    || bounds.width < 88
    || bounds.width > 700
    || bounds.height < 96
    || bounds.height > 820) {
    return undefined;
  }
  return bounds;
}

export function createWindowStateStore({
  userDataPath,
  readFile = fs.readFile,
  writeFile = fs.writeFile,
  renameFile = fs.rename,
} = {}) {
  if (typeof userDataPath !== "string" || userDataPath.trim().length === 0) {
    throw new TypeError("userDataPath must be a non-empty string");
  }
  const statePath = path.join(userDataPath, FILE_NAME);

  return Object.freeze({
    statePath,
    async load() {
      try {
        const value = JSON.parse(await readFile(statePath, "utf8"));
        return normalizeBounds(value);
      } catch {
        return undefined;
      }
    },
    async save(value) {
      const bounds = normalizeBounds(value);
      if (!bounds) {
        throw new TypeError("value must contain valid window bounds");
      }
      const temporaryPath = `${statePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(bounds), {
        encoding: "utf8",
        mode: 0o600,
      });
      await renameFile(temporaryPath, statePath);
      return { saved: true };
    },
  });
}
