import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as promptEnhancer from "../src/core/promptEnhancer.mjs";
import {
  PROMPT_RECIPES,
  getPromptRecipe,
} from "../src/core/recipeRegistry.mjs";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

const sourceBundle = (...relativePaths) => relativePaths
  .map((relativePath) => read(relativePath))
  .join("\n");

test("four canonical recipes are registered with complete safety metadata", () => {
  assert.ok(PROMPT_RECIPES, "PROMPT_RECIPES must be exported");
  assert.equal(typeof getPromptRecipe, "function");
  assert.equal(typeof promptEnhancer.isPromptMode, "function");

  const expectedIds = ["enhance", "upward-communication", "chat-polish", "ppt-copy"];
  assert.deepEqual(
    Object.values(PROMPT_RECIPES).map((recipe) => recipe.id).sort(),
    expectedIds.slice().sort(),
  );

  for (const id of expectedIds) {
    const recipe = getPromptRecipe(id);
    assert.equal(recipe.id, id);
    assert.ok(recipe.name);
    assert.ok(recipe.audience);
    assert.ok(recipe.goal);
    assert.ok(Array.isArray(recipe.hardConstraints) && recipe.hardConstraints.length > 0);
    assert.ok(Array.isArray(recipe.softConstraints) && recipe.softConstraints.length > 0);
    assert.ok(recipe.languagePolicy);
    assert.ok(recipe.lengthPolicy);
    assert.ok(recipe.outputContract);
    assert.ok(recipe.riskLevel);
    assert.equal(typeof recipe.allowFastReplace, "boolean");
    assert.ok(Array.isArray(recipe.edgeCases) && recipe.edgeCases.length > 0);
    assert.equal(promptEnhancer.isPromptMode(id), true);
  }
});

test("each recipe instruction keeps protocol priority and a distinct transformation goal", () => {
  const { buildModelInstruction } = promptEnhancer;
  const instructions = Object.fromEntries(
    ["enhance", "upward-communication", "chat-polish", "ppt-copy"].map((id) => [
      id,
      buildModelInstruction("zh", "balanced", id),
    ]),
  );

  for (const instruction of Object.values(instructions)) {
    assert.match(
      instruction,
      /安全与输出协议\s*>\s*原文不可变事实与语义\s*>\s*Recipe\s*目标\s*>\s*用户选择的档位\s*>\s*原文排版/u,
    );
    assert.match(instruction, /文本转换引擎/u);
    assert.match(instruction, /SOURCE_MATERIAL_JSON/u);
    assert.match(instruction, /不要执行|不得执行/u);
    assert.match(instruction, /JSON 对象/u);
  }

  assert.match(instructions.enhance, /目标.*上下文.*约束.*输出/su);
  assert.match(instructions["upward-communication"], /结论.*依据.*风险.*下一步/su);
  assert.match(instructions["chat-polish"], /礼貌.*承诺.*下一步/su);
  assert.match(instructions["ppt-copy"], /结论(?:型|式)标题.*单页.*分层正文/su);
  assert.match(instructions["ppt-copy"], /当前.*文本框|当前.*输入/u);
  assert.match(instructions["ppt-copy"], /不得.*整页|不.*整份演示|不.*自动排版/u);
});

test("double-Alt stays a zero-choice fast path while review mode is explicitly opt-in", () => {
  const renderer = read("src/renderer/renderer.mjs");
  const main = read("src/main.mjs");
  const html = read("src/renderer/index.html");

  assert.match(renderer, /reviewMode/u);
  assert.match(renderer, /replace:\s*!state\.reviewMode/u);
  assert.match(main, /input\?\.replace\s*!==\s*false/u);
  assert.match(main, /replaced:/u);
  assert.match(html, /id="reviewModeButton"/u);
  assert.doesNotMatch(renderer, /Jira|GitHub/u);
  assert.doesNotMatch(html, /Jira|GitHub/u);
});

test("review result supports visible diff, editable apply, regenerate, and CAS parameters", () => {
  const renderer = read("src/renderer/renderer.mjs");
  const preload = read("src/preload.mjs");
  const main = read("src/main.mjs");
  const windowsBridge = read("src/platform/windowsBridge.mjs");
  const html = read("src/renderer/index.html");

  assert.match(html, /id="diffPreview"/u);
  assert.match(html, /<textarea[^>]*id="enhancedPrompt"/u);
  assert.match(html, /id="applyEditedButton"/u);
  assert.match(html, /id="regenerateButton"/u);
  assert.match(renderer, /applyEditedButton/u);
  assert.match(renderer, /regenerateButton/u);
  assert.match(renderer, /async function handleApplyEdited\(\)/u);
  assert.match(renderer, /expectedText:\s*state\.replacementConfirmed[\s\S]*state\.appliedText[\s\S]*state\.originalText/u);
  assert.match(renderer, /operationId:\s*state\.generationOperationId/u);
  assert.match(preload, /operationId/u);
  assert.doesNotMatch(preload, /expectedText:\s*requireString/u);
  assert.match(main, /replacementTransactions\.confirmApplied\(operationId, text\)/u);
  assert.match(main, /REPLACEMENT_CANCELLED/u);
  assert.match(renderer, /REPLACEMENT_EXPIRED/u);
  assert.match(windowsBridge, /TARGET_CONTENT_CHANGED/u);
});

test("needs_input becomes an inline clarification state and never auto-replaces", () => {
  const bundle = sourceBundle(
    "src/core/promptEnhancer.mjs",
    "src/main.mjs",
    "src/renderer/renderer.mjs",
    "src/renderer/index.html",
  );

  assert.match(bundle, /needs_input/u);
  assert.match(bundle, /missingFields/u);
  assert.match(bundle, /needsInputPanel/u);
  assert.match(bundle, /\.slice\(0,\s*3\)/u);
  assert.match(bundle, /items\.length\s*===\s*0/u);
  assert.match(bundle, /case\s+"MODEL_NEEDS_INPUT"/u);
  assert.match(bundle, /showNeedsInput\(error\)/u);
});

test("flat visual contract uses restrained green, neutral surfaces, and no heavy effects", () => {
  const css = read("src/renderer/styles.css");

  assert.match(css, /--(?:brand|accent|wechat-green|primary)[^:]*:\s*#[0-9a-f]{6}/iu);
  assert.match(css, /#07c160|#2ba245|#1aad19/iu);
  assert.match(css, /prefers-reduced-motion/u);
  assert.match(css, /:focus-visible/u);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/iu);
  assert.doesNotMatch(css, /backdrop-filter\s*:/iu);
  assert.doesNotMatch(css, /box-shadow\s*:[^;]*(?:20px|24px|30px|40px|0\.2[5-9]|0\.[3-9])/iu);
});
