/**
 * Deterministic, privacy-preserving metrics for Prompt Lift model outputs.
 *
 * This module intentionally does not log, retain, or return source/result
 * text. It is suitable for running over synthetic fixtures or redacted
 * production telemetry. Semantic quality that needs an LLM judge belongs in
 * a separate layer; these checks are the hard, reproducible gate.
 */

export const EVALUATION_SCHEMA_VERSION = '1.0';
export const DEFAULT_PROTOCOL_VERSION = '2.0';
export const DEFAULT_MAX_EXPANSION_RATIO = 3;
export const DEFAULT_RELATIVE_IMPROVEMENT_PERCENT = 3;
export const DEFAULT_MIN_ABSOLUTE_GAIN = 1;
// Promotion is defined by relative uplift. Callers may opt into an absolute
// noise floor, but the default must not silently turn a 3% gain into a larger
// requirement for low-valued scores.
export const DEFAULT_MIN_RATE_ABSOLUTE_GAIN = 0;

const REQUIRED_PROTOCOL_FIELDS = Object.freeze([
  'protocol',
  'mode',
  'language',
  'status',
  'result',
]);
const VALID_STATUSES = new Set(['ok', 'unchanged', 'needs_input']);

const ANCHOR_PATTERNS = Object.freeze({
  urls: /https?:\/\/[^\s<>"'，。；、：！？]+/giu,
  windowsPaths: /\b[A-Za-z]:\\[^\r\n\t"'<>|，。；、：！？]+/gu,
  issueIds: /\b[A-Z][A-Z0-9]+-\d+\b/gu,
  emails: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  flags: /(?<!\w)--[a-z][\w-]*/giu,
  numbers: /\b\d[\d./:-]*\b/gu,
  inlineCode: /`[^`\r\n]+`/gu,
  templateVars: /(?:\{\{[^{}\r\n]+\}\}|\$\{[^{}\r\n]+\})/gu,
});

// These are intentionally category-level patterns. The report returns only
// category names and counts, never the matching source/result fragments.
const SCOPE_PATTERNS = Object.freeze({
  platform: /\b(?:android|ios|macos|windows|linux|web|mobile|desktop|cloud|browser|api|sdk|app|application|platform|wps|word|excel|powerpoint|ppt)\b|(?:安卓|苹果|移动端|桌面端|网页|云端|平台|应用|小程序|插件)/iu,
  audience: /\b(?:user|users|customer|customers|client|clients|children|kids|enterprise|marketing|manager|executive|audience|stakeholder)\b|(?:用户|客户|儿童|企业|营销|管理层|受众|干系人)/iu,
  workflow: /\b(?:deploy|deployment|workflow|pipeline|implementation|rollout|launch|operate|operation|monitor|monitoring|metric|metrics|test|testing|diagnostic)\b|(?:部署|流程|实施|上线|运营|监控|指标|测试|诊断)/iu,
  deliverable: /\b(?:report|presentation|template|document|code|script|dashboard|slide|slides|ppt)\b|(?:报告|演示|模板|文档|代码|脚本|看板|幻灯片)/iu,
  capability: /\b(?:permission|permissions|plugin|plugins|version|versions|parameter|parameters|acceptance|credential)\b|(?:权限|插件|版本|参数|验收|凭据)/iu,
  newSolution: /\b(?:recommend|recommendation|solution|approach|method|action plan|next step|proposal)\b|(?:建议方案|解决方案|方法|行动计划|下一步|提案)/iu,
});

const MODALITY_PATTERNS = Object.freeze({
  soft: /(?:建议|可以|可能|或许|也许|可考虑|如需|如果|suggest(?:ion|ed)?|consider|could|may|might|optional|possible|if|when)/giu,
  hard: /(?:必须|务必|要求|确保|一定|不得不|必然|must|shall|required|need to|have to|ensure|definitely|guarantee|certainly|\bwill\b)/giu,
  negative: /(?:不得|禁止|不能|不要|仅限|只允许|不可|must not|do not|don't|never|cannot|only if|unless)/giu,
});

function asText(value) {
  return typeof value === 'string' ? value : '';
}

function countCharacters(value) {
  return Array.from(asText(value)).length;
}

function countMatches(text, pattern) {
  const source = asText(text);
  pattern.lastIndex = 0;
  const matches = source.match(pattern) ?? [];
  pattern.lastIndex = 0;
  return matches;
}

function uniqueMatches(text, pattern) {
  return [...new Set(
    countMatches(text, pattern)
      .map((value) => value.replace(/[，。；、：！？,.!?:;]+$/u, ''))
      .filter(Boolean),
  )];
}

function anchorSummary(source, result) {
  const byCategory = {};
  let sourceTotal = 0;
  let preservedTotal = 0;
  for (const [category, pattern] of Object.entries(ANCHOR_PATTERNS)) {
    const sourceAnchors = uniqueMatches(source, pattern);
    const resultText = asText(result);
    const preserved = sourceAnchors.filter((anchor) => resultText.includes(anchor));
    byCategory[category] = {
      sourceCount: sourceAnchors.length,
      preservedCount: preserved.length,
      missingCount: sourceAnchors.length - preserved.length,
      recall: sourceAnchors.length === 0 ? 1 : preserved.length / sourceAnchors.length,
    };
    sourceTotal += sourceAnchors.length;
    preservedTotal += preserved.length;
  }
  return {
    sourceCount: sourceTotal,
    preservedCount: preservedTotal,
    missingCount: sourceTotal - preservedTotal,
    recall: sourceTotal === 0 ? 1 : preservedTotal / sourceTotal,
    byCategory,
    passed: preservedTotal === sourceTotal,
  };
}

function scopeSummary(source, result, allowNewScenarios = false) {
  const sourceText = asText(source);
  const resultText = asText(result);
  const introduced = Object.entries(SCOPE_PATTERNS)
    .filter(([, pattern]) => pattern.test(resultText) && !pattern.test(sourceText))
    .map(([category]) => category);
  return {
    introducedCategoryCount: introduced.length,
    introducedCategories: introduced,
    allowed: Boolean(allowNewScenarios),
    passed: allowNewScenarios || introduced.length === 0,
  };
}

function modalitySummary(source, result) {
  const counts = {};
  for (const [category, pattern] of Object.entries(MODALITY_PATTERNS)) {
    counts[category] = {
      sourceCount: countMatches(source, pattern).length,
      resultCount: countMatches(result, pattern).length,
    };
  }
  const softDropped = counts.soft.sourceCount > 0
    && counts.soft.resultCount === 0
    && counts.hard.resultCount > 0;
  const negativeDropped = counts.negative.sourceCount > 0
    && counts.negative.resultCount === 0;
  const hardEscalation = counts.soft.sourceCount > 0
    && counts.hard.resultCount > 0
    && counts.soft.resultCount === 0;
  return {
    ...counts,
    softDropped,
    negativeDropped,
    hardEscalation,
    passed: !softDropped && !negativeDropped && !hardEscalation,
  };
}

function normalizeResponse(response) {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    return { envelope: response, parsePassed: true };
  }
  if (typeof response !== 'string') {
    return { envelope: null, parsePassed: false };
  }
  try {
    const envelope = JSON.parse(response);
    return {
      envelope: envelope && typeof envelope === 'object' && !Array.isArray(envelope)
        ? envelope
        : null,
      parsePassed: Boolean(envelope && typeof envelope === 'object' && !Array.isArray(envelope)),
    };
  } catch {
    return { envelope: null, parsePassed: false };
  }
}

function protocolSummary(envelope, expected) {
  const object = envelope && typeof envelope === 'object' && !Array.isArray(envelope)
    ? envelope
    : null;
  const missingFields = object
    ? REQUIRED_PROTOCOL_FIELDS.filter((field) => !Object.hasOwn(object, field))
    : [...REQUIRED_PROTOCOL_FIELDS];
  const extraFields = object
    ? Object.keys(object).filter((field) => !REQUIRED_PROTOCOL_FIELDS.includes(field))
    : [];
  const typesPassed = Boolean(
    object
      && typeof object.protocol === 'string'
      && typeof object.mode === 'string'
      && typeof object.language === 'string'
      && typeof object.status === 'string'
      && typeof object.result === 'string',
  );
  const valuesPassed = Boolean(
    object
      && object.protocol === expected.protocolVersion
      && (expected.mode === undefined || object.mode === expected.mode)
      && (expected.language === undefined || object.language === expected.language),
  );
  return {
    parsePassed: Boolean(object),
    requiredFieldsPassed: missingFields.length === 0,
    typesPassed,
    valuesPassed,
    missingFields,
    extraFields,
    passed: Boolean(object)
      && missingFields.length === 0
      && extraFields.length === 0
      && typesPassed
      && valuesPassed,
  };
}

function statusSummary(envelope, source, expectedStatuses) {
  const status = envelope?.status;
  const result = asText(envelope?.result);
  const validStatus = VALID_STATUSES.has(status);
  const exactUnchanged = status === 'unchanged' && result === asText(source);
  const changedOk = status === 'ok' && result !== asText(source);
  const questionCount = (result.match(/[?？]/gu) ?? []).length;
  const needsInputShape = status !== 'needs_input' || (result.length > 0 && questionCount <= 1);
  const expectedPassed = !Array.isArray(expectedStatuses)
    || expectedStatuses.length === 0
    || expectedStatuses.includes(status);
  return {
    value: VALID_STATUSES.has(status) ? status : null,
    validStatus,
    exactUnchanged,
    changedOk,
    needsInputShape,
    expectedPassed,
    passed: validStatus
      && (status === 'unchanged' ? exactUnchanged : status === 'ok' ? changedOk : needsInputShape)
      && expectedPassed,
  };
}

function boundedRatio(resultCharacters, sourceCharacters) {
  if (sourceCharacters === 0) {
    return resultCharacters === 0 ? 0 : Infinity;
  }
  return resultCharacters / sourceCharacters;
}

function lengthSummary(source, result, maxExpansionRatio) {
  const sourceCharacters = countCharacters(source);
  const resultCharacters = countCharacters(result);
  const maxRatio = Number.isFinite(maxExpansionRatio) && maxExpansionRatio >= 0
    ? maxExpansionRatio
    : DEFAULT_MAX_EXPANSION_RATIO;
  const ratio = boundedRatio(resultCharacters, sourceCharacters);
  const maximumCharacters = Math.floor(sourceCharacters * maxRatio);
  return {
    sourceCharacters,
    resultCharacters,
    ratio,
    maxRatio,
    maximumCharacters,
    overflowCharacters: Math.max(0, resultCharacters - maximumCharacters),
    passed: resultCharacters <= maximumCharacters,
  };
}

function scorePart(passed, value = passed ? 1 : 0) {
  return passed ? 1 : Math.max(0, Math.min(1, Number(value) || 0));
}

function aggregateScore(parts) {
  const weights = {
    protocol: 0.2,
    status: 0.1,
    length: 0.2,
    anchors: 0.2,
    scope: 0.15,
    modality: 0.15,
  };
  const componentScores = {
    protocol: scorePart(parts.protocol.passed),
    status: scorePart(parts.status.passed),
    length: scorePart(parts.length.passed),
    anchors: scorePart(parts.anchors.passed, parts.anchors.recall),
    scope: scorePart(parts.scope.passed, parts.scope.introducedCategoryCount === 0 ? 1 : 0),
    modality: scorePart(parts.modality.passed),
  };
  const normalized = Object.entries(weights)
    .reduce((total, [key, weight]) => total + componentScores[key] * weight, 0);
  return {
    score: Number((normalized * 100).toFixed(4)),
    componentScores,
    weights,
  };
}

function numericMetric(group, keys) {
  for (const key of keys) {
    const value = Number(group?.[key]);
    if (Number.isFinite(value)) return Math.max(0, Math.min(1, value));
  }
  return null;
}

function reportQualityScore(report) {
  const hardScore = Number(report?.aggregateScore);
  const hard = Number.isFinite(hardScore)
    ? Math.max(0, Math.min(1, hardScore / 100))
    : Number(report?.qualityScore);
  const semantic = numericMetric(report?.semantic, ['fidelity', 'semanticFidelity', 'score'])
    ?? numericMetric(report, ['semanticFidelity']);
  const task = numericMetric(report?.task, ['utility', 'taskScore', 'score'])
    ?? numericMetric(report, ['taskScore', 'utility']);
  const hardValue = Number.isFinite(hard) ? hard : 0;
  const semanticValue = semantic ?? hardValue;
  const taskValue = task ?? hardValue;
  return Number((hardValue * 0.6 + semanticValue * 0.25 + taskValue * 0.15).toFixed(6));
}

/**
 * Evaluate one model response. The input may contain sourceText and response
 * as either a protocol JSON string or parsed envelope. The output is safe to
 * persist: it contains no source text, result text, or anchor values.
 */
export function evaluateModelOutput(input = {}) {
  const source = asText(input.sourceText);
  const responseValue = input.response ?? input.modelOutput ?? input.output;
  const expected = {
    protocolVersion: typeof input.protocolVersion === 'string'
      ? input.protocolVersion
      : DEFAULT_PROTOCOL_VERSION,
    mode: typeof input.mode === 'string' ? input.mode : undefined,
    language: typeof input.language === 'string' ? input.language : undefined,
  };
  const normalized = normalizeResponse(responseValue);
  const envelope = normalized.envelope;
  const protocol = protocolSummary(envelope, expected);
  const result = asText(envelope?.result);
  const length = lengthSummary(source, result, input.maxExpansionRatio);
  const status = statusSummary(envelope, source, input.expectedStatuses);
  const anchors = anchorSummary(source, result);
  const scope = scopeSummary(source, result, input.allowNewScenarios);
  const modality = modalitySummary(source, result);
  const hardGatePassed = protocol.passed
    && status.passed
    && length.passed
    && anchors.passed
    && scope.passed
    && modality.passed;
  const aggregate = aggregateScore({ protocol, status, length, anchors, scope, modality });
  const failures = [];
  if (!protocol.passed) failures.push('PROTOCOL_INVALID');
  if (!status.passed) failures.push('STATUS_INVALID');
  if (!length.passed) failures.push('RESULT_TOO_LONG');
  if (!anchors.passed) failures.push('ANCHOR_LOSS');
  if (!scope.passed) failures.push('SCOPE_EXPANSION');
  if (!modality.passed) failures.push('SEMANTIC_MODALITY_DRIFT');
  const report = {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    hardGatePassed,
    aggregateScore: aggregate.score,
    qualityScore: reportQualityScore({
      aggregateScore: aggregate.score,
      semantic: input.semantic,
      task: input.task,
      semanticFidelity: input.semanticFidelity,
      taskScore: input.taskScore,
      utility: input.utility,
    }),
    scoreBreakdown: aggregate.componentScores,
    metrics: {
      protocol,
      status,
      length,
      anchors,
      scope,
      modality,
    },
    failures,
    privacy: {
      containsRawSource: false,
      containsRawResult: false,
    },
  };
  for (const group of ['hard', 'semantic', 'task']) {
    if (input[group] && typeof input[group] === 'object' && !Array.isArray(input[group])) {
      report[group] = sanitizeMetricGroup(input[group]);
    }
  }
  return report;
}

/**
 * Public name used by the evaluation runner. Kept separate from the longer
 * implementation name so callers can treat a fixture as one evaluation case.
 */
export function evaluateCase(input = {}) {
  const report = evaluateModelOutput(input);
  // Optional judge results may be supplied by a separate process. We retain
  // only scalar booleans/numbers; arbitrary strings could contain raw prompts.
  for (const group of ['hard', 'semantic', 'task']) {
    if (input[group] && typeof input[group] === 'object' && !Array.isArray(input[group])) {
      report[group] = sanitizeMetricGroup(input[group]);
    }
  }
  return report;
}

function sanitizeMetricGroup(group) {
  const safe = {};
  for (const [key, value] of Object.entries(group)) {
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      safe[key] = value;
    }
  }
  return safe;
}

function reportMetricPass(report, key) {
  if (key === 'length') return report?.metrics?.length?.passed === true;
  if (key === 'anchors') return report?.metrics?.anchors?.passed === true;
  if (key === 'scope') return report?.metrics?.scope?.passed === true;
  if (key === 'modality') return report?.metrics?.modality?.passed === true;
  if (key === 'protocol') return report?.metrics?.protocol?.passed === true;
  if (key === 'status') return report?.metrics?.status?.passed === true;
  return false;
}

function finiteValues(values) {
  return values.filter((value) => Number.isFinite(value));
}

function aggregateScalarGroup(reports, group) {
  const values = reports
    .map((report) => report?.[group])
    .filter((value) => value && typeof value === 'object' && !Array.isArray(value));
  const keys = [...new Set(values.flatMap((value) => Object.keys(value)))];
  return Object.fromEntries(keys.map((key) => {
    const samples = values
      .map((value) => value[key])
      .filter((value) => typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)));
    if (samples.length === 0) return [key, null];
    const numeric = samples.filter((value) => typeof value === 'number');
    if (numeric.length === samples.length) {
      return [key, Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(4))];
    }
    return [key, samples.filter(Boolean).length / samples.length];
  }));
}

/**
 * Aggregate case reports without returning any source/result text. The
 * `cases` argument may be an array or an object containing `cases`.
 */
export function aggregateMetrics(cases = []) {
  const reports = Array.isArray(cases) ? cases : (Array.isArray(cases?.cases) ? cases.cases : []);
  const count = reports.length;
  const passCount = reports.filter((report) => report?.hardGatePassed === true).length;
  const scoreValues = finiteValues(reports.map((report) => Number(
    report?.aggregateScore ?? report?.qualityScore,
  )));
  const qualityValues = finiteValues(reports.map((report) => reportQualityScore(report)));
  const metricKeys = ['protocol', 'status', 'length', 'anchors', 'scope', 'modality'];
  const passRates = Object.fromEntries(metricKeys.map((key) => [
    key,
    count === 0 ? 0 : reports.filter((report) => reportMetricPass(report, key)).length / count,
  ]));
  const anchorRecalls = finiteValues(reports.map((report) => Number(report?.metrics?.anchors?.recall)));
  const ratios = finiteValues(reports.map((report) => Number(report?.metrics?.length?.ratio)));
  const averageAggregateScore = scoreValues.length === 0
    ? 0
    : Number((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length).toFixed(4));
  const averageQualityScore = qualityValues.length === 0
    ? 0
    : Number((qualityValues.reduce((sum, value) => sum + value, 0) / qualityValues.length).toFixed(6));
  const groupedMetrics = {
    hard: aggregateScalarGroup(reports, 'hard'),
    semantic: aggregateScalarGroup(reports, 'semantic'),
    task: aggregateScalarGroup(reports, 'task'),
  };
  const failureCounts = {};
  for (const report of reports) {
    for (const failure of report?.failures ?? []) {
      if (typeof failure === 'string') failureCounts[failure] = (failureCounts[failure] ?? 0) + 1;
    }
  }
  return {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    caseCount: count,
    hardGatePassCount: passCount,
    hardGatePassRate: count === 0 ? 0 : passCount / count,
    averageAggregateScore,
    qualityScore: averageQualityScore,
    semanticFidelity: Number(
      groupedMetrics.semantic.fidelity
        ?? groupedMetrics.semantic.semanticFidelity
        ?? 0,
    ),
    scopeInventionRate: Number(groupedMetrics.semantic.scopeInventionRate ?? 0),
    utility: Number(
      groupedMetrics.task.utility
        ?? groupedMetrics.task.taskScore
        ?? 0,
    ),
    repairRate: Number(groupedMetrics.hard.repairRate ?? 0),
    lengthViolationRate: count === 0 ? 0 : 1 - passRates.length,
    averageAnchorRecall: anchorRecalls.length === 0
      ? 0
      : Number((anchorRecalls.reduce((sum, value) => sum + value, 0) / anchorRecalls.length).toFixed(4)),
    averageLengthRatio: ratios.length === 0
      ? 0
      : Number((ratios.reduce((sum, value) => sum + value, 0) / ratios.length).toFixed(4)),
    passRates,
    groupedMetrics,
    failureCounts,
    privacy: {
      containsRawSource: false,
      containsRawResult: false,
    },
  };
}

/**
 * Compare one higher-is-better metric. For a zero baseline, the percentage
 * is deliberately null because no finite relative percentage exists.
 */
export function compareMetric(baseline, candidate, options = {}) {
  const direction = options.direction === 'lower' ? 'lower' : 'higher';
  const threshold = Number.isFinite(options.thresholdPercent)
    ? options.thresholdPercent
    : (Number.isFinite(options.threshold)
      ? options.threshold * 100
      : DEFAULT_RELATIVE_IMPROVEMENT_PERCENT);
  const base = Number(baseline);
  const next = Number(candidate);
  if (!Number.isFinite(base) || !Number.isFinite(next)) {
    return {
      direction,
      baseline: base,
      candidate: next,
      relativeImprovementPercent: null,
      meetsThreshold: false,
      comparable: false,
    };
  }
  const scale = options.scale === 'rate' ? 'rate' : 'score';
  const minAbsoluteGain = Number.isFinite(options.minAbsoluteGain)
    ? Math.max(0, options.minAbsoluteGain)
    : (scale === 'rate' ? DEFAULT_MIN_RATE_ABSOLUTE_GAIN : DEFAULT_MIN_ABSOLUTE_GAIN);
  const absoluteBaseline = Math.abs(base);
  const lowBaseline = absoluteBaseline < minAbsoluteGain;
  const denominator = lowBaseline ? minAbsoluteGain : absoluteBaseline;
  const gain = direction === 'higher' ? next - base : base - next;
  const relativeImprovementPercent = denominator === 0
    ? (gain > 0 ? Infinity : 0)
    : Number(((gain / denominator) * 100).toFixed(4));
  const meetsThreshold = gain >= minAbsoluteGain
    && relativeImprovementPercent >= threshold;
  return {
    direction,
    baseline: base,
    candidate: next,
    relativeImprovementPercent,
    meetsThreshold,
    comparable: true,
    absoluteGain: Number(gain.toFixed(4)),
    minAbsoluteGain,
    lowBaseline,
  };
}

/**
 * Compare evaluation reports. Hard-gate regressions block promotion even if
 * the aggregate score rises. The default promotion threshold is +3% relative.
 */
export function compareEvaluations(baseline, candidate, options = {}) {
  const thresholdPercent = Number.isFinite(options.thresholdPercent)
    ? options.thresholdPercent
    : (Number.isFinite(options.threshold)
      ? options.threshold * 100
      : DEFAULT_RELATIVE_IMPROVEMENT_PERCENT);
  const baselineScore = baseline?.qualityScore ?? baseline?.averageAggregateScore ?? baseline?.aggregateScore;
  const candidateScore = candidate?.qualityScore ?? candidate?.averageAggregateScore ?? candidate?.aggregateScore;
  const scoreScale = Math.max(Math.abs(Number(baselineScore) || 0), Math.abs(Number(candidateScore) || 0)) <= 1
    ? 'rate'
    : 'score';
  const scoreComparison = compareMetric(
    baselineScore,
    candidateScore,
    { direction: 'higher', thresholdPercent, scale: scoreScale },
  );
  const hardGateRegression = Boolean(baseline?.hardGatePassed && !candidate?.hardGatePassed);
  return {
    baselineScore: Number(baselineScore) || 0,
    candidateScore: Number(candidateScore) || 0,
    relativeImprovementPercent: scoreComparison.relativeImprovementPercent,
    thresholdPercent,
    scoreMeetsThreshold: scoreComparison.meetsThreshold,
    hardGateRegression,
    eligibleForPromotion: scoreComparison.meetsThreshold && !hardGateRegression,
  };
}

/**
 * Return detailed promotion evidence for aggregate reports. `baseline` and
 * `candidate` may be aggregateMetrics results or objects with equivalent
 * fields. Hard-gate pass rate is a non-regressing lower-is-better guard.
 */
export function evaluatePromotion(baseline, candidate, options = {}) {
  if (arguments.length === 1 && baseline && typeof baseline === 'object'
    && Object.hasOwn(baseline, 'baseline') && Object.hasOwn(baseline, 'candidate')) {
    ({ baseline, candidate, ...options } = baseline);
  }
  const threshold = Number.isFinite(options.threshold)
    ? options.threshold
    : (Number.isFinite(options.thresholdPercent)
      ? options.thresholdPercent / 100
      : DEFAULT_RELATIVE_IMPROVEMENT_PERCENT / 100);
  const thresholdPercent = threshold * 100;
  const baselineScore = baseline?.qualityScore ?? baseline?.averageAggregateScore ?? baseline?.aggregateScore;
  const candidateScore = candidate?.qualityScore ?? candidate?.averageAggregateScore ?? candidate?.aggregateScore;
  const scoreScale = Math.max(Math.abs(Number(baselineScore) || 0), Math.abs(Number(candidateScore) || 0)) <= 1
    ? 'rate'
    : 'score';
  const scoreComparison = compareMetric(
    baselineScore,
    candidateScore,
    {
      direction: 'higher',
      thresholdPercent,
      scale: scoreScale,
      minAbsoluteGain: options.minAbsoluteGain,
    },
  );
  const hardComparison = compareMetric(
    baseline?.hardGatePassRate,
    candidate?.hardGatePassRate,
    { direction: 'higher', thresholdPercent: 0, scale: 'rate', minAbsoluteGain: 0 },
  );
  const hardGateRegression = (hardComparison.comparable
    && candidate.hardGatePassRate < baseline.hardGatePassRate)
    || Boolean(baseline?.hardGatePassed === true && candidate?.hardGatePassed === false);
  const reasons = [];
  const nonRegressionDirections = Object.freeze({
    semanticFidelity: 'higher',
    anchorRecall: 'higher',
    utility: 'higher',
    scopeInventionRate: 'lower',
    repairRate: 'lower',
    lengthViolationRate: 'lower',
  });
  const nonRegressionChecks = {};
  let qualityRegression = false;
  for (const [key, direction] of Object.entries(nonRegressionDirections)) {
    const baseValue = Number(baseline?.[key]);
    const candidateValue = Number(candidate?.[key]);
    if (!Number.isFinite(baseValue) || !Number.isFinite(candidateValue)) continue;
    const regressed = direction === 'higher'
      ? candidateValue < baseValue
      : candidateValue > baseValue;
    nonRegressionChecks[key] = {
      direction,
      baseline: baseValue,
      candidate: candidateValue,
      regressed,
      passed: !regressed,
    };
    if (regressed) {
      qualityRegression = true;
      reasons.push(`${key} regressed`);
    }
  }
  if (!scoreComparison.meetsThreshold) {
    reasons.push('aggregate score did not improve by the required threshold');
  }
  if (hardGateRegression) {
    reasons.push('hard-gate performance regressed');
  }
  const improvementRatio = scoreComparison.relativeImprovementPercent === null
    ? null
    : Number((scoreComparison.relativeImprovementPercent / 100).toFixed(6));
  const promoted = scoreComparison.meetsThreshold && !hardGateRegression && !qualityRegression;
  return {
    promoted,
    eligibleForPromotion: promoted,
    threshold,
    improvementRatio,
    reasons,
    scoreComparison,
    hardGateComparison: hardComparison,
    hardGateRegression,
    nonRegressionChecks,
    qualityRegression,
    thresholdPercent,
  };
}

export function shouldPromote(baseline, candidate, options = {}) {
  if (arguments.length === 1 && baseline && typeof baseline === 'object'
    && Object.hasOwn(baseline, 'baseline') && Object.hasOwn(baseline, 'candidate')) {
    return evaluatePromotion(baseline).promoted;
  }
  return evaluatePromotion(baseline, candidate, options).promoted;
}

/**
 * Compact, persistence-safe summary for CI or dashboards. It deliberately
 * omits case-level data and all input/output text.
 */
export function createSummary(reportsOrAggregate = [], options = {}) {
  if (reportsOrAggregate && typeof reportsOrAggregate === 'object'
    && !Array.isArray(reportsOrAggregate)
    && (Object.hasOwn(reportsOrAggregate, 'baseline')
      || Object.hasOwn(reportsOrAggregate, 'candidate')
       || Object.hasOwn(reportsOrAggregate, 'runId'))) {
    const input = reportsOrAggregate;
    const baseline = input.baseline;
    const candidate = input.candidate;
    const decision = input.decision
      ?? (baseline && candidate ? evaluatePromotion(baseline, candidate, input) : undefined);
    const summary = {
      schemaVersion: EVALUATION_SCHEMA_VERSION,
      runId: typeof input.runId === 'string' ? input.runId : undefined,
      baseline: baseline ? createSummary(baseline) : undefined,
      candidate: candidate ? createSummary(candidate) : undefined,
      decision: decision ? {
        promoted: Boolean(decision.promoted ?? decision.eligibleForPromotion),
        eligibleForPromotion: Boolean(decision.eligibleForPromotion ?? decision.promoted),
        threshold: Number.isFinite(decision.threshold) ? decision.threshold : DEFAULT_RELATIVE_IMPROVEMENT_PERCENT / 100,
        improvementRatio: Number.isFinite(decision.improvementRatio) ? decision.improvementRatio : null,
        reasons: Array.isArray(decision.reasons) ? decision.reasons.filter((value) => typeof value === 'string') : [],
      } : undefined,
      privacy: {
        containsRawSource: false,
        containsRawResult: false,
        containsCredentials: false,
      },
    };
    return Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined));
  }
  const aggregate = reportsOrAggregate?.caseCount !== undefined
    ? reportsOrAggregate
    : (reportsOrAggregate && typeof reportsOrAggregate === 'object'
      && !Array.isArray(reportsOrAggregate)
      && (Number.isFinite(reportsOrAggregate.qualityScore)
        || Number.isFinite(reportsOrAggregate.aggregateScore)
        || Number.isFinite(reportsOrAggregate.averageAggregateScore))
      ? {
        schemaVersion: EVALUATION_SCHEMA_VERSION,
        caseCount: Number.isFinite(reportsOrAggregate.caseCount) ? reportsOrAggregate.caseCount : 0,
        hardGatePassRate: Number(reportsOrAggregate.hardGatePassRate) || 0,
        averageAggregateScore: Number(
          reportsOrAggregate.qualityScore
            ?? reportsOrAggregate.aggregateScore
            ?? reportsOrAggregate.averageAggregateScore,
        ),
        qualityScore: Number(
          reportsOrAggregate.qualityScore
            ?? reportsOrAggregate.aggregateScore
            ?? reportsOrAggregate.averageAggregateScore,
        ),
        averageAnchorRecall: Number(reportsOrAggregate.averageAnchorRecall) || 0,
        averageLengthRatio: Number(reportsOrAggregate.averageLengthRatio) || 0,
        passRates: reportsOrAggregate.passRates ?? {},
        groupedMetrics: reportsOrAggregate.groupedMetrics ?? {},
        failureCounts: reportsOrAggregate.failureCounts ?? {},
        privacy: { containsRawSource: false, containsRawResult: false },
      }
      : aggregateMetrics(reportsOrAggregate));
  const summary = {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    caseCount: aggregate.caseCount,
    hardGatePassRate: aggregate.hardGatePassRate,
    averageAggregateScore: aggregate.averageAggregateScore,
    qualityScore: aggregate.qualityScore ?? aggregate.averageAggregateScore,
    averageAnchorRecall: aggregate.averageAnchorRecall,
    averageLengthRatio: aggregate.averageLengthRatio,
    passRates: aggregate.passRates,
    groupedMetrics: aggregate.groupedMetrics,
    failureCounts: aggregate.failureCounts,
    privacy: aggregate.privacy,
  };
  if (options.baseline && options.candidate) {
    summary.promotion = evaluatePromotion(options.baseline, options.candidate, options);
  }
  return summary;
}
