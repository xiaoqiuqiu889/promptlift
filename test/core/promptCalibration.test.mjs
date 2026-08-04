import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildModelInstruction,
  enhancePrompt,
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
  assert.equal(RECIPE_SCHEMA_VERSION, '1.3');
  const recipe = getRecipe(PROMPT_MODES.enhance);
  assert.deepEqual(MODEL_STYLE_MAX_EXPANSION_RATIOS, {
    faithful: 1.25,
    concise: 1.5,
    professional: 2.25,
    creative: 3.5,
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

test('model instruction states the non-creative scope gate and creative 350 percent ceiling', () => {
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
  assert.match(creativeInstruction, /350%|3\.5x|3\.5 times/i);
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

test('creative output is accepted at the exact 350 percent ceiling', async () => {
  const source = 'Improve the login request with clear steps and an output format.';
  const maxLength = maxAllowedResultLength(source, MODEL_STYLES.creative);
  const result = 'Use the original request and one optional creative direction. '
    .repeat(Math.ceil(maxLength / 58))
    .slice(0, maxLength);
  const actual = await enhancePrompt(source, modelOptions({
    mode: PROMPT_MODES.enhance,
    style: MODEL_STYLES.creative,
    result,
  }));
  assert.equal(actual, result);
  assert.equal(actual.length <= Math.floor(source.length * 3.5), true);
});

test('creative output over 350 percent is rejected before replacement', async () => {
  const source = 'Improve the login request with clear steps and an output format.';
  const result = 'Use the original request and one optional creative direction. '
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
