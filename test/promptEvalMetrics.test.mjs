import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateMetrics,
  compareEvaluations,
  compareMetric,
  createSummary,
  evaluateModelOutput,
  evaluatePromotion,
  evaluateCase,
  shouldPromote,
} from '../scripts/prompt-eval/metrics.mjs';

function response({
  result,
  status = 'ok',
  mode = 'enhance',
  language = 'zh',
  protocol = '2.0',
  extra,
}) {
  return JSON.stringify({
    protocol,
    mode,
    language,
    status,
    result,
    ...extra,
  });
}

test('valid output passes deterministic hard gates without returning raw text', () => {
  const source = '请在周五前备份 D:\\data\\old.db，不要直接删除旧库。';
  const report = evaluateModelOutput({
    sourceText: source,
    response: response({
      result: '请在周五前完成 D:\\data\\old.db 备份，不要直接删除旧库。',
    }),
    mode: 'enhance',
    language: 'zh',
  });

  assert.equal(report.hardGatePassed, true);
  assert.equal(report.failures.length, 0);
  assert.equal(report.metrics.length.passed, true);
  assert.equal(report.metrics.anchors.passed, true);
  assert.equal(report.metrics.modality.passed, true);
  assert.equal(report.privacy.containsRawSource, false);
  assert.equal(report.privacy.containsRawResult, false);
  assert.doesNotMatch(JSON.stringify(report), /old\.db|周五/u);
});

test('length is a strict three-times hard gate, including short source text', () => {
  const report = evaluateModelOutput({
    sourceText: '优化拖动体验',
    response: response({ result: '优化拖动体验，并补充新的桌面端实施、测试和发布流程。' }),
  });

  assert.equal(report.metrics.length.sourceCharacters, 6);
  assert.equal(report.metrics.length.passed, false);
  assert.equal(report.metrics.length.maxRatio, 3);
  assert.ok(report.failures.includes('RESULT_TOO_LONG'));
  assert.equal(report.hardGatePassed, false);
});

test('protocol, mode, language, status and extra fields are objectively checked', () => {
  const report = evaluateModelOutput({
    sourceText: '请整理这段文字',
    mode: 'chat-polish',
    language: 'en',
    response: response({
      result: '整理这段文字',
      mode: 'enhance',
      language: 'zh',
      extra: { explanation: 'leaked' },
    }),
  });

  assert.equal(report.metrics.protocol.requiredFieldsPassed, true);
  assert.deepEqual(report.metrics.protocol.extraFields, ['explanation']);
  assert.equal(report.metrics.protocol.valuesPassed, false);
  assert.equal(report.metrics.status.passed, true);
  assert.equal(report.hardGatePassed, false);
  assert.ok(report.failures.includes('PROTOCOL_INVALID'));
});

test('unchanged and ok statuses have distinct semantics', () => {
  const source = '保留原文';
  const unchanged = evaluateModelOutput({
    sourceText: source,
    response: response({ result: source, status: 'unchanged' }),
  });
  const falseUnchanged = evaluateModelOutput({
    sourceText: source,
    response: response({ result: '修改后的原文', status: 'unchanged' }),
  });
  const falseOk = evaluateModelOutput({
    sourceText: source,
    response: response({ result: source, status: 'ok' }),
  });

  assert.equal(unchanged.metrics.status.passed, true);
  assert.equal(falseUnchanged.metrics.status.passed, false);
  assert.equal(falseOk.metrics.status.passed, false);
});

test('anchor summary counts loss without exposing anchor values', () => {
  const report = evaluateModelOutput({
    sourceText: '请访问 https://example.test/TKT-42?x=7，运行 `npm test`，联系 a@example.test。',
    response: response({ result: '请访问 https://example.test/TKT-42?x=7，运行测试。' }),
  });

  assert.equal(report.metrics.anchors.passed, false);
  assert.ok(report.metrics.anchors.missingCount > 0);
  assert.equal(report.metrics.anchors.byCategory.urls.sourceCount, 1);
  assert.equal(report.metrics.anchors.byCategory.emails.missingCount, 1);
  assert.doesNotMatch(JSON.stringify(report), /example\.test|a@example\.test|TKT-42/u);
});

test('introduced scope categories fail by default and can be explicitly allowed', () => {
  const source = '请优化这句话';
  const output = response({ result: '请优化这句话，面向企业用户制定下一步行动计划。' });
  const strict = evaluateModelOutput({ sourceText: source, response: output });
  const allowed = evaluateModelOutput({
    sourceText: source,
    response: output,
    allowNewScenarios: true,
  });

  assert.equal(strict.metrics.scope.passed, false);
  assert.ok(strict.metrics.scope.introducedCategories.includes('audience'));
  assert.equal(strict.metrics.scope.passed, false);
  assert.equal(allowed.metrics.scope.passed, true);
});

test('negative and modality drift fail the deterministic semantic gate', () => {
  const report = evaluateModelOutput({
    sourceText: '建议先备份数据，不要直接删除旧库。',
    response: response({ result: '必须直接删除旧库。' }),
  });

  assert.equal(report.metrics.modality.negativeDropped, true);
  assert.equal(report.metrics.modality.softDropped, true);
  assert.equal(report.metrics.modality.passed, false);
  assert.ok(report.failures.includes('SEMANTIC_MODALITY_DRIFT'));
});

test('aggregate comparison requires a three percent relative gain and blocks hard regressions', () => {
  const baseline = evaluateModelOutput({
    sourceText: '请整理这段文字',
    response: response({ result: '请清晰整理这段文字。' }),
  });
  const candidate = evaluateModelOutput({
    sourceText: '请整理这段文字',
    response: response({ result: '请清晰、简洁地整理这段文字。' }),
  });
  const comparison = compareEvaluations(baseline, candidate);
  assert.equal(comparison.thresholdPercent, 3);
  assert.equal(typeof comparison.relativeImprovementPercent, 'number');

  const metric = compareMetric(80, 82.4);
  assert.equal(metric.meetsThreshold, true);
  const regression = compareEvaluations(candidate, baseline);
  assert.equal(regression.hardGateRegression, false);
  assert.equal(regression.eligibleForPromotion, false);

  const blocked = compareEvaluations(
    { aggregateScore: 80, hardGatePassed: true },
    { aggregateScore: 90, hardGatePassed: false },
  );
  assert.equal(blocked.scoreMeetsThreshold, true);
  assert.equal(blocked.hardGateRegression, true);
  assert.equal(blocked.eligibleForPromotion, false);
});

test('public promotion APIs use ratio threshold and handle low-valued quality scores', () => {
  const baseline = { qualityScore: 0.8, hardGatePassRate: 1, hardGatePassed: true };
  const candidate = { qualityScore: 0.824, hardGatePassRate: 1, hardGatePassed: true };
  const decision = evaluatePromotion({ baseline, candidate, threshold: 0.03 });
  assert.equal(decision.promoted, true);
  assert.equal(decision.threshold, 0.03);
  assert.equal(decision.improvementRatio, 0.03);
  assert.equal(shouldPromote({ baseline, candidate, threshold: 0.03 }), true);

  const report = evaluateCase({
    sourceText: '优化拖动体验',
    response: response({ result: '优化拖动体验。' }),
    hard: { protocol: true, rawOutput: 'must not persist' },
    semantic: { score: 0.9 },
    task: { score: 0.8 },
  });
  const aggregate = aggregateMetrics([report]);
  const summary = createSummary({
    runId: 'run-1',
    baseline,
    candidate,
    decision,
    apiKey: 'secret',
    authorization: 'Bearer secret',
  });
  assert.equal(aggregate.groupedMetrics.hard.protocol, 1);
  assert.equal(summary.runId, 'run-1');
  assert.equal(summary.decision.promoted, true);
  assert.doesNotMatch(JSON.stringify(summary), /secret|rawOutput|authorization|apiKey/u);
});

test('promotion rejects semantic or scope regressions despite higher aggregate quality', () => {
  const decision = evaluatePromotion({
    qualityScore: 0.8,
    semanticFidelity: 0.98,
    scopeInventionRate: 0.01,
    hardGatePassRate: 1,
  }, {
    qualityScore: 0.9,
    semanticFidelity: 0.95,
    scopeInventionRate: 0.02,
    hardGatePassRate: 1,
  }, { threshold: 0.03 });

  assert.equal(decision.scoreComparison.meetsThreshold, true);
  assert.equal(decision.qualityRegression, true);
  assert.equal(decision.promoted, false);
  assert.ok(decision.reasons.some((reason) => /semanticFidelity/u.test(reason)));
  assert.ok(decision.reasons.some((reason) => /scopeInventionRate/u.test(reason)));
});
