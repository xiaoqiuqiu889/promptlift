import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("system prompt customization exposes a mode-by-tier editor and local persistence actions", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const preload = read("src/preload.mjs");
  const main = read("src/main.mjs");

  assert.match(html, /data-menu-action="system-prompts"/);
  assert.match(html, /id="systemPromptPanel"/);
  assert.match(html, /id="viewSystemPromptButton"/);
  assert.match(html, /id="systemPromptCurrent"/);
  assert.doesNotMatch(html, /id="systemPromptDefault"|id="systemPromptEffective"/);
  assert.match(html, /id="systemPromptCustom"/);
  assert.match(html, /id="saveSystemPromptButton"/);
  assert.match(html, /id="resetSystemPromptButton"/);
  assert.match(renderer, /api\.getSystemPrompts\(/);
  assert.match(renderer, /api\.saveSystemPrompt\(/);
  assert.match(renderer, /api\.resetSystemPrompt\(/);
  assert.match(renderer, /function renderSystemPromptPanel\(/);
  assert.match(renderer, /systemPromptStyle/);
  assert.match(preload, /systemPromptsGet: "prompt:system-prompts:get"/);
  assert.match(preload, /systemPromptsSave: "prompt:system-prompts:save"/);
  assert.match(preload, /systemPromptsReset: "prompt:system-prompts:reset"/);
  assert.match(main, /createSystemPromptStore/);
  assert.match(main, /handleIpc\('prompt:system-prompts:get'/);
  assert.match(main, /handleIpc\('prompt:system-prompts:save'/);
  assert.match(main, /handleIpc\('prompt:system-prompts:reset'/);
});

test("system prompt editor exposes only WorkBuddy and keeps custom rules bounded", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const core = read("src/core/promptEnhancer.mjs");

  assert.match(html, /当前场景实际使用的 WorkBuddy 系统提示词/);
  assert.doesNotMatch(html, /data-system-style="(?:faithful|concise|professional|creative)"/);
  assert.match(html, /maxlength="6000"/);
  assert.match(html, /恢复默认/);
  assert.match(renderer, /自定义补充规则/);
  assert.match(renderer, /systemPromptDirty/);
  assert.match(core, /MAX_CUSTOM_SYSTEM_PROMPT_LENGTH\s*=\s*6_000/);
  assert.match(core, /buildWorkBuddyRuntimeContextPrompt/);
  assert.match(core, /Do not append permission-seeking follow-up questions/);
});
