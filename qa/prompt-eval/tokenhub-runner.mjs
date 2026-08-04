import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_ENDPOINT,
  MODEL_STYLES,
  buildModelMessages,
  maxAllowedResultLength,
  resolveModelStyle,
} from '../../src/core/promptEnhancer.mjs';
import { evaluateModelOutput } from '../../scripts/prompt-eval/metrics.mjs';

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_POLICY_LINES = 24;
const MAX_POLICY_LINE_LENGTH = 500;
const PAIRWISE_DIMENSIONS = Object.freeze(['fidelity', 'scope', 'utility', 'brevity', 'modality']);
const PAIRWISE_OUTCOMES = new Set(['candidate', 'baseline', 'tie']);

function requiredEnv(name) {
  const value = typeof process.env[name] === 'string' ? process.env[name].trim() : '';
  if (!value) throw new Error(`${name} is required for the real TokenHub runner.`);
  return value;
}

function chatCompletionsUrl(endpoint) {
  const url = new URL(endpoint || DEFAULT_MODEL_ENDPOINT);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('TOKENHUB_BASE_URL must use HTTP or HTTPS.');
  }
  if (!/\/chat\/completions$/u.test(url.pathname.replace(/\/+$/u, ''))) {
    url.pathname = `${url.pathname.replace(/\/+$/u, '')}/chat/completions`;
  }
  return url.toString();
}

function readPolicyLines(policyText, fixture) {
  if (typeof policyText !== 'string' || !policyText.trim()) return [];
  let policy;
  try {
    policy = JSON.parse(policyText);
  } catch {
    throw new Error('Evaluation policy must be valid JSON.');
  }
  const language = fixture.language === 'zh' ? 'zh' : 'en';
  const style = resolveModelStyle(fixture.style) ?? MODEL_STYLES.concise;
  const mode = typeof fixture.mode === 'string' ? fixture.mode : 'enhance';
  const constraints = policy?.constraints;
  const lines = [];
  if (Number.isFinite(constraints?.maxExpansionRatio)) {
    lines.push(`Promoted maximum expansion ratio: ${constraints.maxExpansionRatio}x the source length.`);
  }
  const add = (value) => {
    if (Array.isArray(value)) lines.push(...value);
  };
  add(constraints?.global?.[language]);
  add(constraints?.modes?.[mode]?.[language]);
  add(constraints?.tiers?.[style]?.[language]);
  return lines
    .filter((line) => typeof line === 'string' && line.trim())
    .map((line) => line.trim().slice(0, MAX_POLICY_LINE_LENGTH))
    .slice(0, MAX_POLICY_LINES);
}

function addPolicyToSystem(messages, policyText, fixture) {
  const policyLines = readPolicyLines(policyText, fixture);
  if (policyLines.length === 0) return messages;
  const system = messages.find((message) => message.role === 'system');
  if (!system) throw new Error('Model messages did not contain a system message.');
  return messages.map((message) => message === system
    ? {
      ...message,
      content: [
        message.content,
        'PROMOTED EVALUATION POLICY (apply only when it does not conflict with immutable source facts):',
        ...policyLines.map((line) => `- ${line}`),
      ].join('\n'),
    }
    : message);
}

function contentText(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => typeof part === 'string' ? part : part?.text ?? '')
    .filter(Boolean)
    .join('');
}

function extractResponse(payload) {
  const choice = payload?.choices?.[0];
  const finishReason = choice?.finish_reason;
  if (finishReason === 'length') throw new Error('MODEL_OUTPUT_TRUNCATED: finish_reason=length.');
  const content = contentText(choice?.message?.content).trim();
  if (!content) {
    if (choice?.message?.reasoning_content) {
      throw new Error('MODEL_OUTPUT_TRUNCATED: response contained reasoning but no final content.');
    }
    const choiceKeys = choice && typeof choice === 'object' ? Object.keys(choice).sort().join(',') : 'none';
    const messageKeys = choice?.message && typeof choice.message === 'object'
      ? Object.keys(choice.message).sort().join(',')
      : 'none';
    throw new Error(`MODEL_OUTPUT_EMPTY: model returned no final content (choice=${choiceKeys}; message=${messageKeys}).`);
  }
  return content;
}

async function requestModel({ fixture, variant, policyText }) {
  const style = resolveModelStyle(fixture.style) ?? MODEL_STYLES.concise;
  const language = fixture.language === 'zh' ? 'zh' : 'en';
  const mode = typeof fixture.mode === 'string' ? fixture.mode : 'enhance';
  const sourceText = typeof fixture.sourceText === 'string' ? fixture.sourceText : '';
  const messages = addPolicyToSystem(buildModelMessages(sourceText, language, {
    mode,
    style,
    clarification: fixture.clarification,
  }), policyText, fixture);
  const maxResultCharacters = maxAllowedResultLength(sourceText, style);
  return requestChat({
    messages,
    maxTokens: Math.min(4_096, Math.max(512, Math.ceil(maxResultCharacters / 2) + 256)),
  });
}

async function requestChat({ messages, maxTokens }) {
  const apiKey = requiredEnv('TOKENHUB_API_KEY');
  const endpoint = chatCompletionsUrl(process.env.TOKENHUB_BASE_URL || DEFAULT_MODEL_ENDPOINT);
  const model = (process.env.TOKENHUB_MODEL || DEFAULT_MODEL).trim();
  const timeoutMs = Number(process.env.TOKENHUB_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const retries = Number.isInteger(Number(process.env.TOKENHUB_REQUEST_RETRIES))
    ? Math.max(0, Math.min(2, Number(process.env.TOKENHUB_REQUEST_RETRIES)))
    : 1;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: false,
          temperature: Number(process.env.TOKENHUB_TEMPERATURE || 0),
          max_tokens: maxTokens,
          ...( /^deepseek-v4-/iu.test(model) ? { thinking: { type: 'disabled' } } : {}),
          messages,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`MODEL_HTTP_ERROR: status=${response.status}.`);
        error.retryable = response.status === 429 || response.status >= 500;
        const retryAfter = Number(response.headers.get('retry-after'));
        error.retryAfterMs = Number.isFinite(retryAfter)
          ? Math.max(1_000, Math.min(60_000, retryAfter * 1_000))
          : null;
        throw error;
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error('MODEL_INVALID_JSON: response body was not JSON.');
      }
      if (!Array.isArray(payload?.choices)
        || payload.choices.length === 0
        || !payload.choices[0]
        || typeof payload.choices[0] !== 'object') {
        const payloadKeys = payload && typeof payload === 'object'
          ? Object.keys(payload).sort().join(',')
          : 'none';
        const errorKeys = payload?.error && typeof payload.error === 'object'
          ? Object.keys(payload.error).sort().join(',')
          : 'none';
        const choiceCount = Array.isArray(payload?.choices) ? payload.choices.length : 0;
        const firstChoiceKeys = payload?.choices?.[0] && typeof payload.choices[0] === 'object'
          ? Object.keys(payload.choices[0]).sort().join(',')
          : 'none';
        const shapeError = new Error(`MODEL_API_SHAPE: choices missing (payload=${payloadKeys}; choices=${choiceCount}; first=${firstChoiceKeys}; error=${errorKeys}).`);
        shapeError.retryable = true;
        throw shapeError;
      }
      return extractResponse(payload);
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (attempt >= retries) throw new Error('MODEL_TIMEOUT: TokenHub request timed out.');
      } else if (attempt >= retries || (error?.retryable === false)) {
        throw error;
      }
      const retryDelay = Number.isFinite(error?.retryAfterMs)
        ? error.retryAfterMs
        : Math.min(30_000, 1_000 * (2 ** attempt));
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('MODEL_REQUEST_FAILED: retry budget exhausted.');
}

function parsePairwiseJudgement(content) {
  const text = content.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('MODEL_JUDGE_INVALID: judge did not return JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !PAIRWISE_OUTCOMES.has(parsed.winner)) {
    throw new Error('MODEL_JUDGE_INVALID: winner must be candidate, baseline, or tie.');
  }
  const dimensions = {};
  if (!parsed.dimensions || typeof parsed.dimensions !== 'object' || Array.isArray(parsed.dimensions)) {
    throw new Error('MODEL_JUDGE_INVALID: dimensions are required.');
  }
  for (const dimension of PAIRWISE_DIMENSIONS) {
    if (!PAIRWISE_OUTCOMES.has(parsed.dimensions[dimension])) {
      throw new Error(`MODEL_JUDGE_INVALID: missing dimension ${dimension}.`);
    }
    dimensions[dimension] = parsed.dimensions[dimension] === 'candidate'
      ? 'win'
      : parsed.dimensions[dimension] === 'baseline' ? 'loss' : 'tie';
  }
  return {
    outcome: parsed.winner === 'candidate' ? 'win' : parsed.winner === 'baseline' ? 'loss' : 'tie',
    dimensions,
  };
}

export async function judgePair({ fixture, baselineResponse, candidateResponse }) {
  const sourceText = typeof fixture?.sourceText === 'string' ? fixture.sourceText : '';
  const language = fixture?.language === 'zh' ? 'zh' : 'en';
  const deterministicSummary = (response) => {
    const report = evaluateModelOutput({
      sourceText,
      response,
      mode: fixture?.mode,
      language,
      maxExpansionRatio: 3,
    });
    return {
      hardGatePassed: report.hardGatePassed,
      aggregateScore: report.aggregateScore,
      lengthRatio: Number.isFinite(report.metrics.length.ratio) ? report.metrics.length.ratio : null,
      anchorRecall: report.metrics.anchors.recall,
      scopePassed: report.metrics.scope.passed,
      modalityPassed: report.metrics.modality.passed,
    };
  };
  const judgeMessages = [
    {
      role: 'system',
      content: [
        'You are a blind, deterministic pairwise evaluator for rewrite quality.',
        'Compare candidate B against baseline A for the same source task.',
        'Judge only fidelity to the source, scope control, task utility, concise length, and modality preservation.',
        'If semantic fidelity is equivalent, prefer the response with fewer deterministic hard-gate failures and less unnecessary length.',
        'Do not reward extra application scenarios or unsupported facts. A tie means materially equivalent quality.',
        'Return exactly one JSON object with no markdown or explanation:',
        '{"winner":"candidate|baseline|tie","dimensions":{"fidelity":"candidate|baseline|tie","scope":"candidate|baseline|tie","utility":"candidate|baseline|tie","brevity":"candidate|baseline|tie","modality":"candidate|baseline|tie"}}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        language,
        sourceText,
        baselineA: baselineResponse,
        candidateB: candidateResponse,
        deterministicChecks: {
          baselineA: deterministicSummary(baselineResponse),
          candidateB: deterministicSummary(candidateResponse),
        },
      }),
    },
  ];
  const retries = Number.isInteger(Number(process.env.TOKENHUB_JUDGE_RETRIES))
    ? Math.max(0, Math.min(2, Number(process.env.TOKENHUB_JUDGE_RETRIES)))
    : 1;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const judged = await requestChat({ messages: judgeMessages, maxTokens: 768 });
      return parsePairwiseJudgement(judged);
    } catch (error) {
      lastError = error;
      if (!/MODEL_OUTPUT_EMPTY|MODEL_JUDGE_INVALID/u.test(error?.message ?? '')) throw error;
    }
  }
  throw lastError;
}

export async function runCase({ fixture, variant, policyText }) {
  // variant is deliberately part of the request contract for traceability; both
  // variants call the real model and differ only by the supplied policy text.
  void variant;
  return { response: await requestModel({ fixture, variant, policyText }) };
}
