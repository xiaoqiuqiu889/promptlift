import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODEL_STYLES,
  PROMPT_MODES,
  WORKBUDDY_SYSTEM_PROMPTS,
  WORKBUDDY_USER_PROMPT_TEMPLATE,
  buildModelInstruction,
  buildWorkBuddyMessages,
  enhancePrompt,
  resolveModelStyle,
  stripWorkBuddyWrappingQuotes,
} from '../../src/core/promptEnhancer.mjs';

const MODES = Object.freeze([
  PROMPT_MODES.enhance,
  PROMPT_MODES.upwardCommunication,
  PROMPT_MODES.chatPolish,
  PROMPT_MODES.pptCopy,
]);

function completion(content) {
  return {
    status: 200,
    async json() {
      return {
        choices: [{
          finish_reason: 'stop',
          message: { content },
        }],
      };
    },
  };
}

test('WorkBuddy is a canonical fifth tier in all four scenes', () => {
  assert.equal(MODEL_STYLES.workbuddy, 'workbuddy');
  assert.equal(resolveModelStyle('workbuddy'), MODEL_STYLES.workbuddy);

  for (const mode of MODES) {
    const prompt = buildModelInstruction('zh', MODEL_STYLES.workbuddy, mode);
    assert.equal(prompt, WORKBUDDY_SYSTEM_PROMPTS[mode]);
    assert.match(prompt, /Language matching is the highest priority/u);
    assert.match(prompt, /Provide only|Return only/u);
    assert.doesNotMatch(prompt, /SOURCE_MATERIAL_JSON|json_object|protocol/u);
  }
});

test('AI prompt WorkBuddy tier preserves the installed WorkBuddy prompt contract', () => {
  const prompt = WORKBUDDY_SYSTEM_PROMPTS[PROMPT_MODES.enhance];

  assert.match(prompt, /Prompt Engineering Expert/u);
  assert.match(prompt, /ANALYSIS PROCESS:/u);
  assert.match(prompt, /Do NOT answer questions - expand\/rewrite them/u);
  assert.match(prompt, /maximum length should be around 800 characters/u);
  assert.match(prompt, /A website for my dog/u);
});

test('WorkBuddy messages include runtime context continuity before the language wrapper', () => {
  const input = '请把这个需求写清楚';
  const messages = buildWorkBuddyMessages(input, PROMPT_MODES.enhance);

  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], {
    role: 'system',
    content: WORKBUDDY_SYSTEM_PROMPTS[PROMPT_MODES.enhance],
  });
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /downstream assistant that already has access/iu);
  assert.match(messages[1].content, /这个建议|this suggestion/iu);
  assert.match(messages[1].content, /do not ask the user to repeat/iu);
  assert.match(messages[1].content, /lead with a clear conclusion/iu);
  assert.match(messages[1].content, /OVERRIDES the generic instruction to check for missing context/u);
  assert.match(messages[1].content, /其他agent给我提了这个建议/u);
  assert.match(messages[1].content, /never a clarification question/iu);
  assert.match(messages[1].content, /CRITICAL PRIORITY - LANGUAGE CONSISTENCY:/u);
  assert.match(messages[1].content, /USER INPUT: 请把这个需求写清楚/u);
});

test('WorkBuddy quote cleanup matches the one-pass WorkBuddy behavior', () => {
  assert.equal(stripWorkBuddyWrappingQuotes('  “增强结果”  '), '增强结果');
  assert.equal(stripWorkBuddyWrappingQuotes('"增强结果\''), '增强结果');
  assert.equal(stripWorkBuddyWrappingQuotes('增强结果'), '增强结果');
});

test('WorkBuddy model request forwards the selected model without JSON or sampling overrides', async () => {
  const requests = [];
  const result = await enhancePrompt('请优化这个提示词', {
    apiKey: 'test-key',
    endpoint: 'https://example.com/v1',
    model: 'claude-opus-5',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.workbuddy,
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return completion('“请明确目标、约束与期望输出。”');
    },
  });

  assert.equal(result, '请明确目标、约束与期望输出。');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, 'claude-opus-5');
  assert.equal(requests[0].stream, false);
  assert.deepEqual(requests[0].messages, buildWorkBuddyMessages(
    '请优化这个提示词',
    PROMPT_MODES.enhance,
  ));
  assert.equal(Object.hasOwn(requests[0], 'response_format'), false);
  assert.equal(Object.hasOwn(requests[0], 'temperature'), false);
  assert.equal(Object.hasOwn(requests[0], 'max_tokens'), false);
  assert.equal(Object.hasOwn(requests[0], 'thinking'), false);
});

test('WorkBuddy DeepSeek request explicitly uses the installed high-reasoning profile', async () => {
  const requests = [];
  await enhancePrompt('请评估这个建议是否值得采纳', {
    apiKey: 'test-key',
    endpoint: 'https://example.com/v1',
    model: 'deepseek-v4-flash',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.workbuddy,
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return completion('请评估当前对话中的建议是否值得采纳，并先给出明确结论。');
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].temperature, 1);
  assert.deepEqual(requests[0].thinking, {
    type: 'enabled',
    reasoning_effort: 'high',
  });
});

test('WorkBuddy path performs no protocol retry or factual-anchor validation', async () => {
  let calls = 0;
  const result = await enhancePrompt('请保留数字 3 并改写', {
    apiKey: 'test-key',
    endpoint: 'https://example.com/v1',
    model: 'claude-opus-5',
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.workbuddy,
    fetchImpl: async () => {
      calls += 1;
      return completion('这是自然文本结果');
    },
  });

  assert.equal(result, '这是自然文本结果');
  assert.equal(calls, 1);
});
