import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCapturedPayload,
  hasVisiblePromptText,
  normalizeCapturedPrompt,
} from '../../src/core/capturePayload.mjs';

test('hasVisiblePromptText rejects whitespace and zero-width clipboard content', () => {
  assert.equal(hasVisiblePromptText(' \n\u200B\uFEFF '), false);
  assert.equal(hasVisiblePromptText('有效提示词'), true);
});

test('createCapturedPayload keeps one canonical text field for IPC', () => {
  assert.deepEqual(
    createCapturedPayload('原始提示词', { handle: 42 }),
    {
      text: '原始提示词',
      original: '原始提示词',
      target: { handle: 42 },
    },
  );
});

test('normalizeCapturedPrompt accepts the main-process original field', () => {
  const result = normalizeCapturedPrompt({
    original: '请整理这份需求',
    target: { handle: 42 },
  });

  assert.equal(result.text, '请整理这份需求');
  assert.deepEqual(result.target, { handle: 42 });
});

test('normalizeCapturedPrompt prefers the canonical text field', () => {
  const result = normalizeCapturedPrompt({
    text: 'canonical prompt',
    original: 'legacy prompt',
  });

  assert.equal(result.text, 'canonical prompt');
});

test('normalizeCapturedPrompt handles string and invalid payloads safely', () => {
  assert.equal(normalizeCapturedPrompt('plain prompt').text, 'plain prompt');
  assert.deepEqual(normalizeCapturedPrompt(null), { text: '', target: undefined });
});
