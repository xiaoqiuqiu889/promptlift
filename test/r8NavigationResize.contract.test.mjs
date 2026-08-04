import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing end marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

function declarationsFor(css, selector) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gs)]
    .filter((match) => match[1]
      .split(",")
      .map((candidate) => candidate.trim())
      .includes(selector))
    .map((match) => match[2])
    .join("\n");
}

test("round 8 navigation has only 处理 and 我的, with model services merged into 我的", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const profile = sliceBetween(
    html,
    'data-hub-page="profile"',
    '<div class="hub-tabbar"',
  );
  const tabbar = sliceBetween(html, '<div class="hub-tabbar"', "</div>");
  const targets = [...tabbar.matchAll(/data-hub-target="([^"]+)"/g)]
    .map((match) => match[1]);
  const labels = [...tabbar.matchAll(/class="hub-tab-label">([^<]+)</g)]
    .map((match) => match[1]);

  assert.deepEqual(targets, ["process", "profile"]);
  assert.deepEqual(labels, ["处理", "我的"]);
  assert.doesNotMatch(html, /data-hub-(?:page|target)="services"/);
  assert.doesNotMatch(html, /id="hub(?:Page|Tab)Services"/);

  for (const action of ["configure", "check", "startup"]) {
    assert.match(
      profile,
      new RegExp(`data-menu-action="${action}"`),
      `${action} must be reachable from 我的`,
    );
  }
  assert.match(profile, /模型与 Key/);
  assert.match(profile, /检查模型配置/);
  assert.match(profile, /开机自启动/);

  const hubLabels = sliceBetween(
    renderer,
    "const HUB_LABELS = Object.freeze({",
    "});",
  );
  assert.match(hubLabels, /process:\s*"处理"/);
  assert.match(hubLabels, /profile:\s*"我的"/);
  assert.doesNotMatch(hubLabels, /services|服务/);
});

test("compact desktop view exposes a top-right, hit-testable resize handle", () => {
  const html = read("src/renderer/index.html");
  const css = read("src/renderer/styles.css");
  const compactHandle = declarationsFor(
    css,
    '.pet-shell[data-view="compact"] .resize-handle',
  );

  assert.match(
    html,
    /id="resizeHandle"[^>]*type="button"[^>]*aria-label="[^"]*调整[^"]*大小[^"]*"/,
  );
  assert.match(compactHandle, /top:\s*calc\(var\(--pet-center-y\)\s*-\s*var\(--pet-menu-y\)\)/);
  assert.match(compactHandle, /left:\s*calc\(50%\s*\+\s*var\(--pet-menu-x\)\)/);
  assert.match(compactHandle, /display:\s*(?:flex|grid)/);
  assert.match(compactHandle, /pointer-events:\s*auto/);
  assert.match(compactHandle, /z-index:\s*[1-9]\d*/);
  assert.doesNotMatch(compactHandle, /display:\s*none/);
});

test("resize gesture uses pointer capture, preserves aspect ratio, and cannot optimize", () => {
  const renderer = read("src/renderer/renderer.mjs");
  const resizeGesture = sliceBetween(
    renderer,
    'resizeHandle.addEventListener("pointerdown"',
    'window.addEventListener("resize"',
  );

  assert.match(resizeGesture, /addEventListener\("pointerdown"/);
  assert.match(resizeGesture, /addEventListener\("pointermove"/);
  assert.match(resizeGesture, /addEventListener\("pointerup"/);
  assert.match(resizeGesture, /addEventListener\("pointercancel"/);
  assert.match(resizeGesture, /setPointerCapture\(event\.pointerId\)/);
  assert.match(resizeGesture, /releasePointerCapture\(event\.pointerId\)/);
  assert.match(resizeGesture, /event\.preventDefault\(\)/);
  assert.match(resizeGesture, /event\.stopPropagation\(\)/);

  assert.match(
    resizeGesture,
    /(?:aspectRatio|aspect|ratio)\s*:\s*(?:window\.outerWidth|resizeSession\.startWidth)\s*\/\s*(?:window\.outerHeight|resizeSession\.startHeight)/,
    "the gesture must snapshot one aspect ratio before resizing",
  );
  assert.doesNotMatch(
    resizeGesture,
    /scheduleResize\(\s*resizeSession\.startWidth\s*\+\s*event\.screenX\s*-\s*resizeSession\.startX,\s*resizeSession\.startHeight\s*-\s*event\.screenY\s*\+\s*resizeSession\.startY\s*,?\s*\)/s,
    "width and height must not be changed by independent pointer deltas",
  );
  for (const limit of [
    "MIN_COMPACT_WIDTH",
    "MIN_COMPACT_HEIGHT",
    "MAX_COMPACT_WIDTH",
    "MAX_COMPACT_HEIGHT",
  ]) {
    assert.match(renderer, new RegExp(`\\b${limit}\\b`));
  }
  assert.match(resizeGesture, /suppressAvatarClickUntil/);
  assert.match(resizeGesture, /suppressMenuClickUntil/);
  assert.match(
    resizeGesture,
    /resizeSettleToken[\s\S]*settleToken[\s\S]*resizeSettleToken\s*!==\s*settleToken/,
    "an earlier resize acknowledgement must not settle a newer drag session",
  );
  assert.doesNotMatch(resizeGesture, /handleEnhance|api\.enhance|api\.capture|api\.apply/);
});

test("named resize IPC clamps persisted bounds and visual QA proves proportional safe resizing", () => {
  const preload = read("src/preload.mjs");
  const main = read("src/main.mjs");
  const renderer = read("src/renderer/renderer.mjs");
  const visualQa = read("scripts/qa-ui-visual.mjs");

  assert.match(preload, /resize:\s*"prompt:resize"/);
  assert.match(preload, /resize\(width,\s*height,\s*options\s*=\s*\{\}\)/);
  assert.match(preload, /Number\.isSafeInteger\(width\)/);
  assert.match(preload, /Number\.isSafeInteger\(height\)/);
  assert.match(main, /handleIpc\('prompt:resize',\s*resizeWindow\)/);
  assert.match(main, /function resizeWindow\(/);
  assert.match(main, /input\.anchor\s*===\s*'top-right'/);
  assert.match(renderer, /persistCompactSize\(/);

  assert.ok(
    visualQa.includes("compact-resize-preserves-aspect-ratio"),
    "visual QA must include a named compact-resize-preserves-aspect-ratio flow",
  );
  assert.match(
    visualQa,
    /Math\.abs\([^;\n]*after\.(?:width|height)[^;\n]*before\.(?:width|height)[^;\n]*\)/,
    "visual QA must compare the before/after aspect ratio",
  );
  assert.match(
    visualQa,
    /\["capture",\s*"enhance",\s*"apply"\]/,
    "visual QA must audit that a resize gesture does not start optimization",
  );
  assert.match(visualQa, /resize gesture triggered (?:an )?optimization/i);
  assert.match(visualQa, /closestHandle/);
});
