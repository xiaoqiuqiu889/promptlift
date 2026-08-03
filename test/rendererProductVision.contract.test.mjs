import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

test("renderer exposes four expression recipes without adding a hot-path choice", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  for (const mode of ["enhance", "upward-communication", "chat-polish", "ppt-copy"]) {
    assert.match(html, new RegExp(`data-mode="${mode}"`));
    assert.match(renderer, new RegExp(`"${mode}"`));
  }
  assert.match(renderer, /petAvatar\.addEventListener\("click"/);
  assert.match(renderer, /payload\?\.autoEnhance\s*===\s*true/);
  assert.match(
    renderer,
    /function compactFeedbackMessage\([\s\S]*message\.startsWith\("工作模式已切换"\)[\s\S]*MODE_LABELS\[state\.mode\]/u,
    "compact feedback must reveal the mode selected by the zero-window right-click cycle",
  );
});

test("review mode offers editable diff, regenerate, and CAS apply", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  for (const id of [
    "reviewModeButton",
    "originalPreview",
    "diffPreview",
    "enhancedPrompt",
    "applyEditedButton",
    "regenerateButton",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(renderer, /REVIEW_MODE_STORAGE_KEY/);
  assert.match(renderer, /replace:\s*!state\.reviewMode/);
  assert.match(
    renderer,
    /let expectedTargetText[\s\S]*const sourceText = capturedSource\?\.text \?\? await captureSource\(\);[\s\S]*if \(capturedSource === undefined\)\s*\{\s*expectedTargetText = state\.originalText;/u,
    "a fresh left-click capture must replace any prior appliedText CAS baseline",
  );
  assert.match(renderer, /async function handleApplyEdited/);
  assert.match(renderer, /expectedText:\s*state\.replacementConfirmed[\s\S]*state\.appliedText[\s\S]*state\.originalText/);
  assert.match(
    renderer,
    /api\.restore\(state\.originalText,\s*state\.target,\s*\{[\s\S]*expectedText:\s*state\.appliedText\s*\|\|\s*undefined/,
    "restore must compare against the last text actually applied, not unsaved textarea edits",
  );
  assert.match(renderer, /async function handleRegenerate/);
  assert.match(renderer, /function renderDiff\(/);
  assert.match(renderer, /document\.createElement\("del"\)/);
  assert.match(renderer, /document\.createElement\("ins"\)/);
  assert.doesNotMatch(renderer, /(?:diffPreview|originalPreview)\.innerHTML\s*=/);
});

test("needs_input is bounded, inline, and clarification regenerates in review mode", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  assert.match(html, /id="needsInputPanel"/);
  assert.match(html, /id="missingFields"/);
  assert.match(html, /id="clarificationInput"/);
  assert.match(renderer, /error\?\.details/);
  assert.match(renderer, /\.slice\(0,\s*3\)/);
  assert.match(renderer, /state\.reviewMode\s*=\s*true/);
  assert.match(renderer, /--- 用户补充信息（仅用于消解歧义）---/);
});

test("expanded UI uses a light flat palette and no decorative effects", () => {
  const html = read("src/renderer/index.html");
  const css = read("src/renderer/styles.css");
  assert.match(html, /name="color-scheme" content="light"/);
  assert.match(css, /--surface:\s*#f5f5f5/);
  assert.match(css, /--accent:\s*#07c160/);
  assert.match(css, /--text:\s*#191919/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
  assert.doesNotMatch(css, /\banimation\s*:/);
  assert.doesNotMatch(css, /box-shadow\s*:/);
});
