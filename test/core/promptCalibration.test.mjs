import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildModelInstruction,
  buildModelMessages,
  enhancePrompt,
  MAX_MODEL_REPAIR_RETRIES,
  MODEL_STYLES,
  MODEL_STYLE_MAX_EXPANSION_RATIOS,
  maxAllowedResultLength,
  PROMPT_MODES,
  PROMPT_PROTOCOL_VERSION,
} from '../../src/core/promptEnhancer.mjs';
import { getRecipe, RECIPE_SCHEMA_VERSION } from '../../src/core/recipeRegistry.mjs';

const MODEL_OPTIONS = {
  endpoint: 'https://example.test/v1',
  model: 'other-compatible-model',
  apiKey: 'test-only-key',
};

function responseFor({ mode, language, result, status = 'ok' }) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              protocol: PROMPT_PROTOCOL_VERSION,
              mode,
              language,
              status,
              result,
            }),
          },
        }],
      };
    },
  };
}

function modelOptions({ mode, style, result, status = 'ok', onCall }) {
  return {
    ...MODEL_OPTIONS,
    mode,
    style,
    fetchImpl: async (_url, init) => {
      onCall?.(JSON.parse(init.body));
      return responseFor({
        mode,
        language: 'en',
        result,
        status,
      });
    },
  };
}

test('recipe protocol is versioned and exposes conservative style policies', () => {
  assert.equal(RECIPE_SCHEMA_VERSION, '1.4');
  const recipe = getRecipe(PROMPT_MODES.enhance);
  assert.deepEqual(MODEL_STYLE_MAX_EXPANSION_RATIOS, {
    faithful: 1.25,
    concise: 1.5,
    professional: 2.25,
    creative: 3,
  });
  for (const style of Object.values(MODEL_STYLES)) {
    const policy = recipe.styleContracts.en[style];
    assert.equal(policy.preserveAnchors, true);
    assert.equal(policy.preserveCommitmentStrength, true);
    assert.equal(policy.maxExpansionRatio, MODEL_STYLE_MAX_EXPANSION_RATIOS[style]);
  }
  assert.equal(recipe.styleContracts.en.faithful.allowNewScenarios, false);
  assert.equal(recipe.styleContracts.en.concise.allowNewScenarios, false);
  assert.equal(recipe.styleContracts.en.professional.allowNewScenarios, false);
  assert.equal(recipe.styleContracts.en.creative.allowNewScenarios, true);
});

test('model instruction states the non-creative scope gate and creative 300 percent ceiling', () => {
  const strictInstruction = buildModelInstruction(
    'en',
    MODEL_STYLES.professional,
    PROMPT_MODES.enhance,
  );
  const creativeInstruction = buildModelInstruction(
    'en',
    MODEL_STYLES.creative,
    PROMPT_MODES.enhance,
  );
  assert.match(strictInstruction, /non-creative|faithful|concise|professional/i);
  assert.match(strictInstruction, /must not add.*application|new application scenarios/i);
  assert.match(creativeInstruction, /300%|3x|3 times/i);
  assert.match(creativeInstruction, /one final result|single final result/i);
});

test('non-creative output rejects a newly introduced application context', async () => {
  const source = 'Rewrite this request clearly and preserve its original goal.';
  const result = 'Rewrite this request for Word review clearly and preserve its original goal.';
  await assert.rejects(
    enhancePrompt(source, modelOptions({
      mode: PROMPT_MODES.enhance,
      style: MODEL_STYLES.professional,
      result,
    })),
    (error) => error.code === 'MODEL_OUTPUT_SCOPE_INVENTION',
  );
});

test('semantic strength cannot escalate a suggestion into a requirement', async () => {
  const source = 'Please consider adding a short note about the next step.';
  const result = 'You must add a detailed note about the next step.';
  await assert.rejects(
    enhancePrompt(source, modelOptions({
      mode: PROMPT_MODES.chatPolish,
      style: MODEL_STYLES.concise,
      result,
    })),
    (error) => error.code === 'MODEL_OUTPUT_SEMANTIC_ESCALATION',
  );
});

test('safe normalization de-escalates unsupported hard wording when the source is soft-only', async () => {
  const source = '建议先完成产品与运营联合复核，可能存在样本偏差。';
  const result = '要求：先完成产品与运营联合复核，存在样本偏差。';
  const actual = await enhancePrompt(source, {
    ...MODEL_OPTIONS,
    mode: PROMPT_MODES.pptCopy,
    style: MODEL_STYLES.concise,
    fetchImpl: async () => responseFor({
      mode: PROMPT_MODES.pptCopy,
      language: 'zh',
      result,
    }),
  });

  assert.equal(actual, '建议：先完成产品与运营联合复核，可能存在样本偏差。');
});

test('PPT normalization restores omitted source uncertainty and negative clauses', async () => {
  const source = 'S5方案8月6日评审，转化率23%待核对，可能存在样本偏差。建议联合复核，不要在证据齐备前承诺上线日期。';
  const result = 'S5方案8月6日评审，转化率23%待核对，建议联合复核后再定上线日期。';
  const actual = await enhancePrompt(source, {
    ...MODEL_OPTIONS,
    mode: PROMPT_MODES.pptCopy,
    style: MODEL_STYLES.concise,
    fetchImpl: async () => responseFor({
      mode: PROMPT_MODES.pptCopy,
      language: 'zh',
      result,
    }),
  });

  assert.match(actual, /可能存在样本偏差/u);
  assert.match(actual, /不要在证据齐备前承诺上线日期/u);
});

test('modality guard instructions do not require repeating the guard wording', async () => {
  const source = 'Consider merging the duplicate settings; do not turn the suggestion into a requirement.';
  const result = 'Consider merging the duplicate settings while keeping the suggestion soft.';
  const actual = await enhancePrompt(source, modelOptions({
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.professional,
    result,
  }));
  assert.equal(actual, result);
});

test('a negative constraint may be preserved with a natural equivalent phrase', async () => {
  const source = '王经理，建议先复核数据，不要承诺上线时间。';
  const result = '王经理，建议先复核数据，暂不承诺上线时间。';
  const actual = await enhancePrompt(source, {
    ...MODEL_OPTIONS,
    mode: PROMPT_MODES.chatPolish,
    style: MODEL_STYLES.concise,
    fetchImpl: async () => responseFor({
      mode: PROMPT_MODES.chatPolish,
      language: 'zh',
      result,
    }),
  });
  assert.equal(actual, result);
});

test('creative output is accepted at the exact 300 percent ceiling', async () => {
  const source = 'Improve the login request with clear steps and an output format.';
  const maxLength = maxAllowedResultLength(source, MODEL_STYLES.creative);
  const result = 'Improve the original request and add one optional creative direction. '
    .repeat(Math.ceil(maxLength / 58))
    .slice(0, maxLength);
  const actual = await enhancePrompt(source, modelOptions({
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.creative,
    result,
  }));
  assert.equal(actual, result);
  assert.equal(actual.length <= Math.floor(source.length * 3), true);
});

test('every tier uses a strict source-relative length budget without a short-input floor', () => {
  const source = 'Keep this source request intact.';
  for (const style of Object.values(MODEL_STYLES)) {
    const limit = maxAllowedResultLength(source, style);
    assert.equal(limit, Math.floor(source.length * MODEL_STYLE_MAX_EXPANSION_RATIOS[style]));
    assert.equal(limit <= Math.floor(source.length * 3), true);
    assert.equal(limit < 1_200, true);
  }
});

test('creative output over 300 percent is rejected before replacement', async () => {
  const source = 'Improve the login request with clear steps and an output format.';
  const result = 'Improve the original request and add one optional creative direction. '
    .repeat(Math.ceil((maxAllowedResultLength(source, MODEL_STYLES.creative) + 1) / 58))
    .slice(0, maxAllowedResultLength(source, MODEL_STYLES.creative) + 1);
  await assert.rejects(
    enhancePrompt(source, modelOptions({
      mode: PROMPT_MODES.enhance,
      style: MODEL_STYLES.creative,
      result,
    })),
    (error) => error.code === 'MODEL_OUTPUT_TOO_LONG',
  );
});

test('creative output may expand directions but cannot invent a product or platform fact', async () => {
  const source = 'Improve the request and offer one optional direction.';
  const result = 'Improve the request in Word and offer one optional direction.';
  await assert.rejects(
    enhancePrompt(source, modelOptions({
      mode: PROMPT_MODES.enhance,
      style: MODEL_STYLES.creative,
      result,
    })),
    (error) => error.code === 'MODEL_OUTPUT_SCOPE_INVENTION',
  );
});

test('scope invention repair names the unsupported category without expanding the base prompt', async () => {
  const source = 'Improve the request and offer one optional direction.';
  const results = [
    'Improve the request in Word and offer one optional direction.',
    source,
  ];
  const requestBodies = [];
  let calls = 0;

  const actual = await enhancePrompt(source, {
    ...MODEL_OPTIONS,
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.creative,
    fetchImpl: async (_url, init) => {
      requestBodies.push(JSON.parse(init.body));
      return responseFor({
        mode: PROMPT_MODES.enhance,
        language: 'en',
        result: results[calls++],
      });
    },
  });

  assert.equal(actual, source);
  assert.equal(calls, 2);
  assert.match(
    requestBodies[1].messages[0].content,
    /unsupported categories.*Word.*remove them entirely.*do not replace/isu,
  );
});

test('model request keeps one configured model and one source payload', () => {
  const calls = [];
  const options = modelOptions({
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.concise,
    result: 'Rewrite this request clearly.',
    onCall: (body) => calls.push(body),
  });
  return enhancePrompt('Rewrite this request clearly.', options).then(() => {
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'other-compatible-model');
    assert.equal(calls[0].messages.filter((message) => message.role === 'user').length, 1);
    assert.match(calls[0].messages.at(-1).content, /SOURCE_MATERIAL_JSON/);
    assert.match(calls[0].messages[0].content, /one final result|one configured model/i);
  });
});

test('model output cannot replace the requested task intent with another task', async () => {
  const source = 'Please audit the repository and list the prioritized findings.';
  const result = 'Please create a marketing headline for the repository.';
  let calls = 0;

  await assert.rejects(
    enhancePrompt(source, {
      ...MODEL_OPTIONS,
      mode: PROMPT_MODES.enhance,
      style: MODEL_STYLES.professional,
      fetchImpl: async () => {
        calls += 1;
        return responseFor({
          mode: PROMPT_MODES.enhance,
          language: 'en',
          result,
        });
      },
    }),
    (error) => error.code === 'MODEL_OUTPUT_TASK_INTENT_DRIFT',
  );
  assert.equal(calls, MAX_MODEL_REPAIR_RETRIES + 1);
});

test('model output cannot replace an explicit deliverable with another output object', async () => {
  const source = 'Please write an email that notifies the product team about the release.';
  const result = 'Please provide an implementation plan for the release.';
  let calls = 0;

  await assert.rejects(
    enhancePrompt(source, {
      ...MODEL_OPTIONS,
      mode: PROMPT_MODES.enhance,
      style: MODEL_STYLES.professional,
      fetchImpl: async () => {
        calls += 1;
        return responseFor({
          mode: PROMPT_MODES.enhance,
          language: 'en',
          result,
        });
      },
    }),
    (error) => error.code === 'MODEL_OUTPUT_OBJECT_DRIFT',
  );
  assert.equal(calls, MAX_MODEL_REPAIR_RETRIES + 1);
});

test('evidence inputs are not misclassified as requested output objects', async () => {
  const source = [
    'Please audit the repository and produce a P0/P1/P2 report.',
    'Consider checking real code, tests, and interface evidence first.',
  ].join(' ');
  const result = 'Please audit the repository and produce a prioritized P0/P1/P2 report.';

  const actual = await enhancePrompt(source, modelOptions({
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.creative,
    result,
  }));

  assert.equal(actual, result);
});

test('model output cannot invent a unit-bearing acceptance target', async () => {
  const source = 'Please improve the login page request while preserving the current scope and expected behavior.';
  const result = 'Please improve the login page request and require a response time below 2 seconds.';
  let calls = 0;

  await assert.rejects(
    enhancePrompt(source, {
      ...MODEL_OPTIONS,
      mode: PROMPT_MODES.enhance,
      style: MODEL_STYLES.professional,
      fetchImpl: async () => {
        calls += 1;
        return responseFor({
          mode: PROMPT_MODES.enhance,
          language: 'en',
          result,
        });
      },
    }),
    (error) => error.code === 'MODEL_OUTPUT_UNSUPPORTED_FACT',
  );
  assert.equal(calls, MAX_MODEL_REPAIR_RETRIES + 1);
});

test('model output deterministically restores a safe month abbreviation', async () => {
  const source = 'The S5 plan enters review on August 6.';
  const result = 'The S5 plan enters review on Aug 6.';
  const actual = await enhancePrompt(source, modelOptions({
    mode: PROMPT_MODES.pptCopy,
    style: MODEL_STYLES.creative,
    result,
  }));
  assert.equal(actual, source);
});

test('model output deterministically restores a source URL referenced as a generic repository path', async () => {
  const url = 'https://github.com/example/project/tree/codex/test';
  const source = `Please audit ${url} and produce a P0/P1/P2 report.`;
  const result = 'Please audit the given repository path and produce a P0/P1/P2 report.';
  const actual = await enhancePrompt(source, modelOptions({
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.creative,
    result,
  }));

  assert.ok(actual.includes(url));
  assert.doesNotMatch(actual, /given repository path/iu);
});

test('fact-anchor loss gets one bounded repair attempt', async () => {
  const source = 'The S5 plan enters review on August 6, 2026.';
  const results = [
    'The S5 plan enters review on August 6.',
    'The S5 plan enters review on August 6, 2026.',
  ];
  let calls = 0;
  const requestBodies = [];
  const actual = await enhancePrompt(source, {
    ...MODEL_OPTIONS,
    mode: PROMPT_MODES.pptCopy,
    style: MODEL_STYLES.creative,
    fetchImpl: async (_url, init) => {
      requestBodies.push(JSON.parse(init.body));
      return responseFor({
        mode: PROMPT_MODES.pptCopy,
        language: 'en',
        result: results[calls++],
      });
    },
  });
  assert.equal(actual, results[1]);
  assert.equal(calls, 2);
  assert.match(
    requestBodies[1].messages[0].content,
    /Repair focus:.*byte-for-byte.*Required literal anchors.*August 6, 2026.*explicit negative.*suggestion\/possibility/isu,
  );
});

test('PPT recipe keeps suggestion and possibility markers instead of promoting them to requirements', () => {
  const system = buildModelMessages(
    '建议先复核数据，可能存在样本偏差。',
    'zh',
    {
      mode: PROMPT_MODES.pptCopy,
      style: MODEL_STYLES.concise,
    },
  )[0].content;

  assert.match(system, /“建议”仍为建议，“可能”仍为可能/u);
});

test('model output cannot invent a quantified rating scale', async () => {
  const source = 'Show evidence completeness visually.';
  const result = 'Show evidence completeness on a 1-5 scale.';
  await assert.rejects(
    enhancePrompt(source, modelOptions({
      mode: PROMPT_MODES.pptCopy,
      style: MODEL_STYLES.creative,
      result,
    })),
    (error) => error.code === 'MODEL_OUTPUT_UNSUPPORTED_FACT',
  );
});

test('structural list numbering is not treated as an immutable factual number', async () => {
  const source = [
    '1. 保留审阅后应用开关行为',
    '2. 补回取消、恢复原文、重新生成、复制、应用',
    '3. 四种沟通模式使用不同优化档位',
  ].join('\n');
  const result = [
    '- 保留审阅后应用开关行为',
    '- 补回取消、恢复原文、重新生成、复制、应用',
    '- 四种沟通模式使用不同优化档位',
  ].join('\n');
  const actual = await enhancePrompt(source, {
    ...MODEL_OPTIONS,
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.concise,
    fetchImpl: async () => responseFor({
      mode: PROMPT_MODES.enhance,
      language: 'zh',
      result,
    }),
  });

  assert.equal(actual, result);
});

test('numbered product feedback cannot be collapsed into a generic issue count', async () => {
  const source = [
    '1. 我没有开启审阅后应用，但生成后仍进入审阅界面',
    '2. 审阅状态缺少取消、恢复原文、重新生成、复制、应用',
    '3. 四种沟通模式需要使用不同的优化档位',
  ].join('\n');
  const result = '修复产品反馈中的三个问题，并保留原有功能。';
  const actual = await enhancePrompt(source, {
    ...MODEL_OPTIONS,
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.concise,
    fetchImpl: async () => responseFor({
      mode: PROMPT_MODES.enhance,
      language: 'zh',
      result,
    }),
  });

  for (const required of [
    '审阅后应用',
    '取消',
    '恢复原文',
    '重新生成',
    '复制',
    '沟通模式',
    '优化档位',
  ]) {
    assert.match(actual, new RegExp(required, 'u'));
  }
});

test('compact model contract names deliverable and explicit-negative preservation', () => {
  const system = buildModelMessages(
    'Please produce a report and do not claim completion.',
    'en',
    {
      mode: PROMPT_MODES.enhance,
      style: MODEL_STYLES.faithful,
    },
  )[0].content;
  assert.match(system, /named deliverables/iu);
  assert.match(system, /explicit negatives?.*explicit/iu);
  assert.match(system, /verbatim/iu);
});
