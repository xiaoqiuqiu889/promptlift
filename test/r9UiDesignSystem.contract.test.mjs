import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  'utf8',
);

function declarationsFor(css, selector) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gs)]
    .filter((match) => match[1]
      .split(',')
      .map((candidate) => candidate.trim())
      .includes(selector))
    .map((match) => match[2])
    .join('\n');
}

test('feature surfaces use one semantic icon system instead of abstract text glyphs', () => {
  const html = read('src/renderer/index.html');
  const symbolIds = [
    'icon-run',
    'icon-scene',
    'icon-tier',
    'icon-review',
    'icon-prompt',
    'icon-mascot',
    'icon-shortcut',
    'icon-key',
    'icon-model-check',
    'icon-startup',
    'icon-privacy',
    'icon-quit',
    'icon-process',
    'icon-profile',
    'icon-back',
    'icon-close',
  ];

  for (const id of symbolIds) {
    assert.match(html, new RegExp(`<symbol\\s+id="${id}"(?=\\s|>)`), `missing ${id}`);
  }
  assert.match(html, /id="hubActionMascotImage"[^>]*assets\/mascots\//u);

  const iconSpans = [...html.matchAll(/<span class="(?:hub-row-icon|hub-tab-icon|hub-primary-icon)"[^>]*>([\s\S]*?)<\/span>/gu)];
  assert.ok(iconSpans.length >= 10);
  for (const [, contents] of iconSpans) {
    assert.match(contents, /<svg\b[^>]*class="ui-icon"/u);
    assert.doesNotMatch(contents, /[◇✦○≡◉⌨⚙✓◎×]/u);
  }
});

test('close and back controls are distinct, icon-based, and consistently positioned', () => {
  const html = read('src/renderer/index.html');
  const css = read('src/renderer/styles.css');
  const panelControls = [...html.matchAll(/<button\b[^>]*data-close-panel="[^"]+"[^>]*>([\s\S]*?)<\/button>/gu)];

  assert.ok(panelControls.length >= 7);
  assert.doesNotMatch(panelControls.map((match) => match[0]).join('\n'), />\s*[×‹]\s*</u);
  assert.match(html, /class="panel-back"[^>]*aria-label="返回/u);
  assert.match(html, /class="panel-close"[^>]*aria-label="关闭/u);
  assert.match(panelControls.map((match) => match[0]).join('\n'), /href="#icon-(?:back|close)"/u);

  const close = declarationsFor(css, '.panel-close');
  const back = declarationsFor(css, '.panel-back');
  assert.match(close, /width:\s*36px/u);
  assert.match(close, /height:\s*36px/u);
  assert.match(back, /width:\s*36px/u);
  assert.match(back, /height:\s*36px/u);
  assert.match(back, /order:\s*-1/u);
});

test('compact mascot, menu dots, and feedback form one cohesive scalable cluster', () => {
  const css = read('src/renderer/styles.css');
  const renderer = read('src/renderer/renderer.mjs');
  const compactGeometry = read('src/core/compactWindowGeometry.mjs');
  const qa = read('scripts/qa-ui-visual.mjs');
  const feedback = declarationsFor(
    css,
    '.pet-shell[data-view="compact"] .compact-feedback:not([hidden])',
  );
  const handle = declarationsFor(
    css,
    '.pet-shell[data-view="compact"] .resize-handle',
  );
  const greenKnightPupImage = declarationsFor(
    css,
    '.pet-shell[data-view="compact"][data-mascot="green-knight-pup"] .pet-mascot-image',
  );

  assert.match(css, /--pet-visual-size/u);
  assert.match(css, /--pet-feedback-width/u);
  assert.match(feedback, /left:\s*50%/u);
  assert.match(feedback, /width:\s*var\(--pet-feedback-width\)/u);
  assert.doesNotMatch(feedback, /right:\s*8px|bottom:\s*7px/u);

  assert.match(handle, /left:\s*calc\(50%\s*\+\s*var\(--pet-menu-x\)\)/u);
  assert.match(handle, /top:\s*calc\(var\(--pet-center-y\)\s*-\s*var\(--pet-menu-y\)\)/u);
  assert.match(handle, /border:\s*0/u);
  assert.match(handle, /background:\s*transparent/u);
  assert.doesNotMatch(handle, /box-shadow:\s*(?!none\b)[^;]+/u);

  assert.match(renderer, /function updateCompactScale\(\)[\s\S]*--pet-visual-size/su);
  assert.match(renderer, /computeCompactLayout/u);
  assert.match(renderer, /computeCompactShapeRects/u);
  assert.match(renderer, /api\.setShape\(rects\)/u);
  assert.match(renderer, /--pet-feedback-width/u);
  assert.match(renderer, /--pet-feedback-top/u);
  assert.match(renderer, /compactFeedback\.dataset\.phase\s*=\s*phase/u);
  assert.match(compactGeometry, /availableWidth\s*\*\s*0\.96/u);
  assert.match(compactGeometry, /availableHeight\s*\*\s*0\.96/u);
  assert.match(compactGeometry, /feedbackPhase\s*===\s*"loading"\s*\?\s*1\.02\s*:\s*0\.94/u);
  assert.match(compactGeometry, /computeCompactShapeRects/u);
  assert.match(compactGeometry, /isGreenKnightPup\s*\?\s*0\.82\s*:\s*1/u);
  assert.match(greenKnightPupImage, /transform:\s*scale\(1\.3\)\s*translateY\(1px\)/u);
  assert.match(renderer, /--pet-menu-x/u);
  assert.match(renderer, /width:\s*window\.innerWidth/u);
  assert.match(renderer, /height:\s*window\.innerHeight/u);

  assert.match(qa, /compact-menu-to-mascot-distance/u);
  assert.match(qa, /compact-feedback-to-mascot-distance/u);
  assert.match(qa, /compact-mascot-fill-ratio/u);
});

test('expanded UI exposes shared typography, spacing, control, hover, focus, and selected-state tokens', () => {
  const css = read('src/renderer/styles.css');

  for (const token of [
    '--font-ui',
    '--font-size-body',
    '--font-size-title',
    '--space-1',
    '--space-2',
    '--space-3',
    '--control-min-height',
    '--radius-control',
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`), `missing design token ${token}`);
  }

  assert.match(css, /\.hub-row:hover/u);
  assert.match(css, /\.hub-row:focus-visible/u);
  assert.match(css, /\.style-option:hover/u);
  assert.match(css, /\.style-option\.selected/u);
  assert.match(css, /\.mode-option\[aria-pressed="true"\]/u);
  assert.match(css, /\.hub-tab\[aria-selected="true"\]/u);
  assert.match(css, /min-height:\s*var\(--control-min-height\)/u);
});
