import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSummary,
  evaluatePromotion,
  shouldPromote,
} from '../scripts/prompt-eval/metrics.mjs';

const BASELINE = Object.freeze({
  qualityScore: 0.8,
  aggregateScore: 80,
  hardGatePassRate: 1,
  semanticFidelity: 0.9,
  scopeInventionRate: 0,
});

function candidate(overrides = {}) {
  return {
    ...BASELINE,
    qualityScore: 0.824,
    aggregateScore: 82.4,
    ...overrides,
  };
}

test('promotion uses a three-percent relative quality improvement by default', () => {
  assert.equal(shouldPromote(BASELINE, candidate()), true);
  assert.equal(
    shouldPromote(BASELINE, candidate({
      qualityScore: 0.8239,
      aggregateScore: 82.39,
    })),
    false,
  );

  const decision = evaluatePromotion({
    baseline: BASELINE,
    candidate: candidate(),
  });

  assert.equal(decision.promoted, true);
  assert.equal(decision.threshold, 0.03);
  assert.ok(decision.improvementRatio >= 0.03);
});

test('a hard-gate regression rejects promotion even when quality improves', () => {
  const decision = evaluatePromotion({
    baseline: BASELINE,
    candidate: candidate({
      qualityScore: 0.9,
      aggregateScore: 90,
      hardGatePassRate: 0.99,
    }),
  });

  assert.equal(decision.promoted, false);
  assert.match(JSON.stringify(decision.reasons), /hard.?gate/i);
});

test('summary is privacy-safe and does not serialize source text, raw output, or API keys', () => {
  const sourceText = 'PRIVATE_SOURCE_MUST_NOT_BE_SERIALIZED';
  const rawOutput = 'PRIVATE_MODEL_OUTPUT_MUST_NOT_BE_SERIALIZED';
  const apiKey = 'sk-secret-must-not-be-serialized';
  const summary = createSummary({
    runId: 'eval-contract-001',
    sourceText,
    rawOutput,
    apiKey,
    baseline: BASELINE,
    candidate: candidate(),
    decision: evaluatePromotion({
      baseline: BASELINE,
      candidate: candidate(),
    }),
  });

  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, new RegExp(sourceText));
  assert.doesNotMatch(serialized, new RegExp(rawOutput));
  assert.doesNotMatch(serialized, new RegExp(apiKey));
  assert.doesNotMatch(serialized, /"(?:sourceText|rawOutput|apiKey|authorization)"/iu);
  assert.equal(summary.runId, 'eval-contract-001');
});
