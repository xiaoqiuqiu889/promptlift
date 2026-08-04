import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildModelInstruction,
  MODEL_STYLES,
  PROMPT_MODES,
} from '../src/core/promptEnhancer.mjs';

test('compact model instructions stay within the prompt budget for every language, mode, and tier', () => {
  const lengths = [];

  for (const language of ['zh', 'en']) {
    for (const mode of Object.values(PROMPT_MODES)) {
      for (const style of Object.values(MODEL_STYLES)) {
        const instruction = buildModelInstruction(language, style, mode);
        const lineCount = instruction.split('\n').length;
        lengths.push(instruction.length);

        assert.ok(
          instruction.length <= (language === 'zh' ? 2000 : 4500),
          `${language}/${mode}/${style} exceeds compact prompt budget: ${instruction.length}`,
        );
        assert.ok(lineCount <= 40, `${language}/${mode}/${style} has ${lineCount} lines`);
        assert.match(instruction, /SOURCE_MATERIAL_JSON|sourceText/);
        assert.match(instruction, /status=|status：|status=/u);
      }
    }
  }

  assert.ok(Math.max(...lengths) <= 4500);
});

test('compact instructions retain the hard gates that prevent scope and protocol drift', () => {
  const chinese = buildModelInstruction('zh', MODEL_STYLES.concise, PROMPT_MODES.enhance);
  const english = buildModelInstruction('en', MODEL_STYLES.concise, PROMPT_MODES.enhance);

  assert.match(chinese, /事实状态闸门/u);
  assert.match(chinese, /补充信息只用于消解歧义/u);
  assert.match(chinese, /结果本身必须是优化后的用户请求/u);
  assert.match(chinese, /严格限定在原文范围/u);
  assert.match(english, /Fact-state gate/i);
  assert.match(english, /original intent/i);
  assert.match(english, /do not append.*permission/i);
  assert.match(english, /Output exactly one JSON object/i);
});
