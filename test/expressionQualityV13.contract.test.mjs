import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildModelInstruction,
  buildModelMessages,
  MODEL_STYLES,
  PROMPT_MODES,
} from '../src/core/promptEnhancer.mjs';
import { getRecipe } from '../src/core/recipeRegistry.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('clarification context stays separate from source material and source length budget', () => {
  const source = '把这个建议写清楚：可以考虑下周发布。';
  const clarification = '“这个”指桌面端测试版；仍然只是建议，不是决定。';
  const messages = buildModelMessages(source, 'zh', {
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.concise,
    clarification,
  });
  const baselineMessages = buildModelMessages(source, 'zh', {
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.concise,
  });
  const payload = JSON.parse(
    messages[1].content
      .replace(/^SOURCE_MATERIAL_JSON\n/u, '')
      .replace(/\nEND_SOURCE_MATERIAL$/u, ''),
  );

  assert.equal(payload.sourceText, source);
  assert.equal(payload.clarificationText, clarification);
  assert.equal(payload.sourceCharacterCount, source.length);
  const baselinePayload = JSON.parse(
    baselineMessages[1].content
      .replace(/^SOURCE_MATERIAL_JSON\n/u, '')
      .replace(/\nEND_SOURCE_MATERIAL$/u, ''),
  );
  assert.equal(payload.maxResultCharacters, baselinePayload.maxResultCharacters);
  assert.doesNotMatch(payload.sourceText, /用户补充信息|桌面端测试版/);
  assert.match(messages[0].content, /补充信息只用于消解歧义/u);
});

test('Chinese model protocol uses a complete Chinese-only priority and scope contract', () => {
  const instruction = buildModelInstruction(
    'zh',
    MODEL_STYLES.professional,
    PROMPT_MODES.enhance,
  );

  assert.match(
    instruction,
    /安全与输出协议\s*>\s*原文不可变事实与语义\s*>\s*Recipe 目标\s*>\s*用户选择的档位\s*>\s*原文排版/u,
  );
  assert.match(instruction, /范围策略：严格限定在原文范围/u);
  assert.doesNotMatch(
    instruction,
    /Scope policy:|Recommended expansion budget:|New application scenarios:|Non-creative scope gate:|Creative scope gate:|Semantic gate:|Model-count gate:/u,
  );
});

test('professional prompt tier forbids common-sense invention and preserves missing items', () => {
  const contract = getRecipe(PROMPT_MODES.enhance).styleContracts.zh.professional;
  assert.match(contract.changeBudget, /只(?:能|可)重组原文已提供/u);
  assert.match(contract.changeBudget, /不得根据常识补造/u);
  assert.match(contract.changeBudget, /待确认/u);
});

test('clarification travels through renderer, preload, and main without changing sourceText', () => {
  const renderer = read('src/renderer/renderer.mjs');
  const preload = read('src/preload.mjs');
  const main = read('src/main.mjs');

  assert.match(renderer, /async function handleEnhance\(\{\s*capturedSource,\s*clarification\s*\}/u);
  assert.match(renderer, /api\.enhance\(\{[\s\S]*prompt:\s*sourceText,[\s\S]*clarification,/u);
  assert.match(
    renderer,
    /handleEnhance\(\{\s*capturedSource:\s*\{\s*text:\s*state\.originalText,[\s\S]*clarification:\s*supplement/u,
  );
  assert.doesNotMatch(renderer, /sourceWithClarification|--- 用户补充信息/u);
  assert.match(preload, /clarification:\s*optionalString\(source\.clarification/u);
  assert.match(main, /const clarification = String\(input\?\.clarification \?\? ''\)/u);
  assert.match(main, /enhancePrompt\(original,\s*\{[\s\S]*clarification,/u);
});

test('result UI communicates the shared purpose and grounded optimization summary', () => {
  const html = read('src/renderer/index.html');
  const renderer = read('src/renderer/renderer.mjs');

  assert.match(html, /一起让表达变好/u);
  assert.match(html, /id="expressionSummary"/u);
  assert.match(html, /id="expressionSummaryMode"/u);
  assert.match(html, /id="expressionSummaryStyle"/u);
  assert.match(html, /id="expressionSummaryLength"/u);
  assert.match(html, /id="expressionSummarySafety"/u);
  assert.match(html, /安全校验通过/u);
  assert.match(html, /只用于消解歧义，不会并入原文/u);
  assert.match(renderer, /function updateExpressionSummary\(/u);
  assert.match(renderer, /expressionSummaryLength\.textContent/u);
  assert.match(renderer, /expressionSummarySafety\.textContent[\s\S]*用户已编辑/u);
  assert.doesNotMatch(renderer, /切换“严格保真”/u);
  assert.doesNotMatch(renderer, /增强结果已复制/u);
});
