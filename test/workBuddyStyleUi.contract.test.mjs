import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  'utf8',
);

test('the sole WorkBuddy tier is selectable and inspectable in every scene', () => {
  const html = read('src/renderer/index.html');
  const renderer = read('src/renderer/renderer.mjs');
  const main = read('src/main.mjs');

  assert.match(html, /data-style="workbuddy"[^>]*><strong>WorkBuddy<\/strong>/u);
  assert.match(html, /data-system-style="workbuddy"/u);
  assert.match(renderer, /workbuddy:\s*"WorkBuddy"/u);
  assert.match(renderer, /WORKBUDDY_MODEL_STAGE_TIMEOUT_MS\s*=\s*300_000/u);
  assert.match(
    renderer,
    /timeoutMs:\s*state\.style\s*===\s*"workbuddy"[\s\S]*WORKBUDDY_MODEL_STAGE_TIMEOUT_MS[\s\S]*MODEL_STAGE_TIMEOUT_MS/u,
  );
  assert.equal(
    (renderer.match(/workbuddy:\s*Object\.freeze\(\{/gu) ?? []).length,
    4,
    'all four scene presentation maps must describe WorkBuddy',
  );
  assert.match(main, /createSystemPromptEntry\(mode,\s*MODEL_STYLES\.workbuddy\)/u);
  assert.match(
    main,
    /input\.style\s*===\s*MODEL_STYLES\.workbuddy\s*\?\s*MODEL_STYLES\.workbuddy\s*:\s*null/u,
    'renderer-facing IPC must reject retired tier identifiers instead of silently selecting them',
  );
});

test('visual QA exposes the four-scene WorkBuddy-only prompt matrix', () => {
  const preload = read('scripts/qa-renderer-preload.mjs');

  assert.match(
    preload,
    /QA_SYSTEM_PROMPT_STYLES\s*=\s*Object\.freeze\(\["workbuddy"\]\)/u,
  );
  assert.doesNotMatch(preload, /QA_SYSTEM_PROMPT_STYLES[\s\S]{0,120}"(?:faithful|concise|professional|creative)"/u);
});
