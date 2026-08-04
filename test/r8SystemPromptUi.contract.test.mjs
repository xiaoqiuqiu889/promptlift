import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildModelInstruction,
  MODEL_STYLES,
  PROMPT_MODES,
} from "../src/core/promptEnhancer.mjs";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

const MODES = Object.freeze([
  PROMPT_MODES.enhance,
  PROMPT_MODES.upwardCommunication,
  PROMPT_MODES.chatPolish,
  PROMPT_MODES.pptCopy,
]);

const STYLES = Object.freeze([
  MODEL_STYLES.faithful,
  MODEL_STYLES.concise,
  MODEL_STYLES.professional,
  MODEL_STYLES.creative,
]);

function extractSystemPromptPanel(html) {
  const start = html.indexOf('<section id="systemPromptPanel"');
  const end = html.indexOf("</section>", start);
  assert.notEqual(start, -1, "system prompt panel must exist");
  assert.notEqual(end, -1, "system prompt panel must be closed");
  return html.slice(start, end + "</section>".length);
}

function substantivePrompt(prompt) {
  return prompt
    .split("\n")
    .filter((line) => !/^(?:系统提示词规范|Recipe [^\s]+@|档位名称：|只输出一个 JSON 对象)/u.test(line))
    .join("\n")
    .replace(/"mode":"[^"]+"/gu, '"mode":"<mode>"');
}

test("four scenes by four tiers expose sixteen substantive default prompt contracts", () => {
  const prompts = new Map();

  for (const mode of MODES) {
    for (const style of STYLES) {
      const prompt = buildModelInstruction("zh", style, mode);
      const tierContract = prompt
        .split("\n")
        .filter((line) => /^(?:档位目标|改动预算|结构要求|档位禁区)：/u.test(line))
        .join("\n");
      const sceneContract = prompt
        .split("\n")
        .find((line) => line.startsWith("你的唯一任务是"));

      assert.ok(sceneContract, `${mode}:${style} must define a scene-specific task`);
      assert.equal(
        tierContract.split("\n").length,
        4,
        `${mode}:${style} must define goal, change budget, structure, and prohibition`,
      );
      prompts.set(`${mode}:${style}`, substantivePrompt(prompt));
    }
  }

  assert.equal(prompts.size, 16);
  assert.equal(
    new Set(prompts.values()).size,
    16,
    "the 16 defaults must remain different after display-only identifiers are removed",
  );

  for (const mode of MODES) {
    const tierContracts = STYLES.map((style) => prompts.get(`${mode}:${style}`));
    assert.equal(
      new Set(tierContracts).size,
      4,
      `${mode} must provide four substantive tier contracts`,
    );
  }

  for (const style of STYLES) {
    const sceneContracts = MODES.map((mode) => prompts.get(`${mode}:${style}`));
    assert.equal(
      new Set(sceneContracts).size,
      4,
      `${style} must provide four substantive scene contracts`,
    );
  }
});

test("scene and tier selection refresh the single current system prompt", () => {
  const renderer = read("src/renderer/renderer.mjs");

  assert.match(renderer, /const systemPromptCurrent\s*=\s*document\.querySelector\("#systemPromptCurrent"\)/u);
  assert.match(
    renderer,
    /function renderSystemPromptPanel\(\)[\s\S]*systemPromptCurrent\.textContent\s*=\s*entry\.effectivePrompt\s*\?\?\s*entry\.defaultPrompt\s*\?\?\s*""/u,
  );
  assert.match(
    renderer,
    /function selectSystemPrompt\(mode,\s*style\)[\s\S]*state\.systemPromptMode\s*=\s*mode[\s\S]*state\.systemPromptStyle\s*=\s*style[\s\S]*renderSystemPromptPanel\(\)/u,
  );
  assert.match(
    renderer,
    /systemPromptModeSelect\.addEventListener\("change",[\s\S]*selectSystemPrompt\(systemPromptModeSelect\.value,\s*state\.systemPromptStyle\)/u,
  );
  assert.match(
    renderer,
    /systemPromptPanel\.addEventListener\("click",[\s\S]*data-system-style[\s\S]*selectSystemPrompt\(state\.systemPromptMode,\s*style\)/u,
  );
});

test("system prompt panel keeps one read-only current prompt and one editable custom supplement", () => {
  const html = read("src/renderer/index.html");
  const panel = extractSystemPromptPanel(html);

  assert.match(panel, /当前系统提示词（只读）/u);
  assert.match(panel, /<(?:pre|output)\b[^>]*id="systemPromptCurrent"[^>]*>/u);
  assert.match(panel, /<textarea\b[^>]*id="systemPromptCustom"[^>]*maxlength="6000"[^>]*>/u);
  assert.doesNotMatch(panel, /id="systemPromptDefault"/u);
  assert.doesNotMatch(panel, /id="systemPromptEffective"/u);
  assert.doesNotMatch(panel, /默认系统提示词（只读）|当前生效预览（只读）/u);
  assert.equal(
    (panel.match(/<(?:pre|output)\b[^>]*\breadonly\b/gu) ?? []).length,
    0,
    "semantic read-only elements do not need a redundant readonly attribute",
  );
});

test("system prompt page delegates scrolling to the single main card container", () => {
  const html = read("src/renderer/index.html");
  const css = read("src/renderer/styles.css");
  const panel = extractSystemPromptPanel(html);

  assert.doesNotMatch(panel, /system-prompt-scroll/u);
  assert.doesNotMatch(
    css,
    /\.system-prompt-scroll\s*\{[\s\S]*?overflow(?:-y)?:\s*(?:auto|scroll)/u,
  );
  assert.match(
    css,
    /\.pet-shell\[data-view="expanded"\]\s+\.pet-card\s*\{[^}]*overflow-y:\s*auto/u,
    "the expanded card remains the page's one main vertical scroll container",
  );
  assert.match(
    css,
    /\.system-prompt-current\s*\{[^}]*white-space:\s*pre-wrap/u,
    "the current prompt must wrap into the page flow",
  );
  assert.doesNotMatch(
    css,
    /\.system-prompt-current\s*\{[^}]*(?:overflow(?:-y)?:\s*(?:auto|scroll)|max-height:)/u,
    "the read-only current prompt must not create another scroll viewport",
  );
  assert.match(
    css,
    /\.system-prompt-panel\s+\.system-prompt-disclosure\s*\{[^}]*background:\s*var\(--panel\)/u,
    "the disclosure must use the same light flat surface as the rest of the panel",
  );
});
