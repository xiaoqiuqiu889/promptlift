import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_ENDPOINT,
  MODEL_STYLES,
  buildModelMessages,
  maxAllowedResultLength,
  resolveModelStyle,
} from '../../src/core/promptEnhancer.mjs';

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_POLICY_LINES = 24;
const MAX_POLICY_LINE_LENGTH = 500;

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
    throw new Error('MODEL_OUTPUT_EMPTY: model returned no final content.');
  }
  return content;
}

async function requestModel({ fixture, variant, policyText }) {
  const apiKey = requiredEnv('TOKENHUB_API_KEY');
  const endpoint = chatCompletionsUrl(process.env.TOKENHUB_BASE_URL || DEFAULT_MODEL_ENDPOINT);
  const model = (process.env.TOKENHUB_MODEL || DEFAULT_MODEL).trim();
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
  const controller = new AbortController();
  const timeoutMs = Number(process.env.TOKENHUB_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
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
        max_tokens: Math.min(4_096, Math.max(512, Math.ceil(maxResultCharacters / 2) + 256)),
        ...( /^deepseek-v4-/iu.test(model) ? { thinking: { type: 'disabled' } } : {}),
        messages,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`MODEL_HTTP_ERROR: status=${response.status}.`);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('MODEL_INVALID_JSON: response body was not JSON.');
    }
    return extractResponse(payload);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('MODEL_TIMEOUT: TokenHub request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function runCase({ fixture, variant, policyText }) {
  // variant is deliberately part of the request contract for traceability; both
  // variants call the real model and differ only by the supplied policy text.
  void variant;
  return { response: await requestModel({ fixture, variant, policyText }) };
}
