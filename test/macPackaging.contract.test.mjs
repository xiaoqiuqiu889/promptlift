import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, root), "utf8");

test("mac packaging produces separate Apple Silicon and Intel app archives", () => {
  const packageJson = JSON.parse(read("package.json"));
  const script = read("scripts/package-mac.mjs");

  assert.equal(packageJson.scripts["package:mac"], "node scripts/package-mac.mjs");
  assert.match(script, /platform:\s*["']darwin["']/u);
  assert.match(script, /["']arm64["']/u);
  assert.match(script, /["']x64["']/u);
  assert.match(script, /Contents["'],\s*["']Resources["'],\s*["']app\.asar["']/u);
  assert.match(script, /Prompt-Lift-latest-darwin-arm64\.zip/u);
  assert.match(script, /Prompt-Lift-latest-darwin-x64\.zip/u);
  assert.doesNotMatch(script, /osxSign|notarize/u);
});
