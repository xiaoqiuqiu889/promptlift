export function hasVisiblePromptText(value) {
  return typeof value === 'string'
    && value.replace(/[\s\u200B-\u200D\uFEFF]/gu, '').length > 0;
}

export function createCapturedPayload(original, target = null) {
  if (typeof original !== 'string') {
    throw new TypeError('Captured prompt must be a string.');
  }

  return {
    text: original,
    original,
    target: target ?? null,
  };
}

export function normalizeCapturedPrompt(payload) {
  if (typeof payload === 'string') {
    return { text: payload, target: undefined };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { text: '', target: undefined };
  }

  const text = typeof payload.text === 'string'
    ? payload.text
    : typeof payload.original === 'string' ? payload.original : '';

  return {
    text,
    target: payload.target,
  };
}
