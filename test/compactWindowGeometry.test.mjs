import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  computeCompactLayout,
  computeCompactShapeRects,
} from "../src/core/compactWindowGeometry.mjs";

function unionBounds(rects) {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

test("large compact windows keep scaling the mascot instead of growing transparent padding", () => {
  const layout = computeCompactLayout({
    width: 420,
    height: 490,
    feedbackVisible: false,
    feedbackPhase: "idle",
  });

  assert.ok(layout.visualSize >= 380, `expected a tightly filled mascot, got ${layout.visualSize}`);
  assert.ok((420 - layout.visualSize) / 2 <= 20);
  assert.equal(layout.centerY, 245);
});

test("compact feedback stays attached to the mascot and inside the window", () => {
  const layout = computeCompactLayout({
    width: 120,
    height: 140,
    feedbackVisible: true,
    feedbackPhase: "success",
  });

  const mascotBottom = layout.centerY + (layout.visualSize / 2);
  assert.ok(layout.feedbackTop <= mascotBottom + layout.feedbackGap);
  assert.ok(layout.feedbackTop + layout.feedbackHeight <= 136);
  assert.ok(layout.feedbackWidth <= 108);
});

test("green knight pup input shape excludes most transparent surrounding pixels", () => {
  const layout = computeCompactLayout({
    width: 420,
    height: 490,
    feedbackVisible: false,
    feedbackPhase: "idle",
  });
  const rects = computeCompactShapeRects({
    ...layout,
    width: 420,
    height: 490,
    mascot: "green-knight-pup",
    feedbackVisible: false,
  });
  const bounds = unionBounds(rects);

  assert.ok(rects.length >= 1 && rects.length <= 4);
  assert.ok(bounds.width / 420 <= 0.84, `shape width remained too broad: ${bounds.width}`);
  assert.ok(bounds.height / 490 <= 0.88, `shape height remained too tall: ${bounds.height}`);
  for (const rect of rects) {
    assert.ok(Number.isSafeInteger(rect.x));
    assert.ok(Number.isSafeInteger(rect.y));
    assert.ok(Number.isSafeInteger(rect.width) && rect.width > 0);
    assert.ok(Number.isSafeInteger(rect.height) && rect.height > 0);
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.width <= 420);
    assert.ok(rect.y + rect.height <= 490);
  }
});

test("visible feedback is included in the interactive shape without restoring a full rectangle", () => {
  const layout = computeCompactLayout({
    width: 240,
    height: 280,
    feedbackVisible: true,
    feedbackPhase: "loading",
  });
  const rects = computeCompactShapeRects({
    ...layout,
    width: 240,
    height: 280,
    mascot: "green-knight-pup",
    feedbackVisible: true,
  });
  const bounds = unionBounds(rects);

  assert.ok(rects.some((rect) => (
    rect.y <= layout.feedbackTop
    && rect.y + rect.height >= layout.feedbackTop + layout.feedbackHeight
  )));
  assert.ok(bounds.width < 240 || bounds.height < 280);
});

test("compact shape crosses the isolated preload boundary and resets for expanded pages", () => {
  const preload = read("src/preload.mjs");
  const main = read("src/main.mjs");
  const renderer = read("src/renderer/renderer.mjs");

  assert.match(preload, /shapeSet:\s*"prompt:shape:set"/);
  assert.match(preload, /function normalizeWindowShape\(rects\)/);
  assert.match(preload, /setShape\(rects\)[\s\S]*PROMPT_LIFT_CHANNELS\.shapeSet/);
  assert.match(main, /function setWindowShape\(/);
  assert.match(main, /mainWindow\.setShape\(rects\)/);
  assert.match(main, /handleIpc\('prompt:shape:set',\s*setWindowShape\)/);
  assert.match(renderer, /api\.setShape\(rects\)/);
  assert.match(renderer, /api\.setShape\(\[\]\)/);
  assert.match(
    renderer,
    /function setMascot\([\s\S]*state\.view === "compact"[\s\S]*updateCompactScale\(\)/,
  );
});
