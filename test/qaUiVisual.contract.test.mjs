import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(relativePath) {
  try {
    await access(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

test("UI visual QA contract has an isolated preload and runner", async () => {
  assert.equal(await exists("scripts/qa-renderer-preload.mjs"), true);
  assert.equal(await exists("scripts/qa-ui-visual.mjs"), true);
});

test("UI visual QA uses trusted input, read-only DOM inspection, and masked mock credentials", async () => {
  const runner = await readFile(path.join(projectRoot, "scripts/qa-ui-visual.mjs"), "utf8");
  const preload = await readFile(path.join(projectRoot, "scripts/qa-renderer-preload.mjs"), "utf8");
  assert.match(runner, /webContents\.sendInputEvent/);
  assert.match(runner, /webContents\.capturePage/);
  assert.match(runner, /webContents\.executeJavaScript/);
  assert.match(runner, /contextIsolation:\s*true/);
  assert.match(runner, /nodeIntegration:\s*false/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("promptLift"/);
  assert.match(preload, /apiKeyLength/);
  assert.doesNotMatch(runner, /Add-Type.*Automation|Get-UIAutomation|System\.Windows\.Automation/i);
});
