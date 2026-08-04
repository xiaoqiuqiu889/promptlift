import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

test("round 1 exposes four task-aligned hubs without copying social or payment modules", () => {
  const html = read("src/renderer/index.html");
  const targets = [...html.matchAll(/data-hub-target="([^"]+)"/g)]
    .map((match) => match[1]);
  const labels = [...html.matchAll(/class="hub-tab-label">([^<]+)</g)]
    .map((match) => match[1]);

  assert.deepEqual(targets, ["process", "scenes", "services", "profile"]);
  assert.deepEqual(labels, ["处理", "场景", "服务", "我的"]);
  for (const hub of targets) {
    assert.match(html, new RegExp(`data-hub-page="${hub}"`));
  }
  assert.doesNotMatch(html, />\s*(?:聊天|朋友圈|支付|小程序)\s*</u);
});

test("round 2 uses a quiet flat hub language with grouped rows and a fixed navigation rhythm", () => {
  const css = read("src/renderer/styles.css");

  assert.match(css, /\.app-hub\s*\{[^}]*background:\s*var\(--surface\)/s);
  assert.match(css, /\.hub-group\s*\{[^}]*background:\s*var\(--panel\)/s);
  assert.match(css, /\.hub-row\s*\{[^}]*min-height:\s*48px/s);
  assert.match(css, /\.hub-tabbar\s*\{[^}]*border-top:\s*1px solid var\(--line\)/s);
  assert.match(css, /\.hub-tab\.is-active\s*\{[^}]*color:\s*var\(--accent-strong\)/s);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
  assert.doesNotMatch(css, /box-shadow\s*:/);
});

test("round 3 opens child panels as a single page and returns to the previous hub", () => {
  const renderer = read("src/renderer/renderer.mjs");
  const showPanel = renderer.slice(
    renderer.indexOf("function showPanel"),
    renderer.indexOf("function showContextMenu"),
  );

  assert.match(showPanel, /contextMenu\.hidden\s*=\s*true/);
  assert.match(showPanel, /root\.dataset\.surface\s*=\s*"panel"/);
  assert.match(renderer, /function showHub\(hub/);
  assert.match(renderer, /state\.hub\s*=\s*normalizedHub/);
  assert.match(renderer, /root\.dataset\.surface\s*=\s*"hub"/);
  assert.match(
    renderer,
    /document\.querySelectorAll\("\[data-close-panel\]"\)[\s\S]*showContextMenu/,
  );
});

test("round 4 provides live status overview and bounded safety guidance", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");

  for (const id of [
    "hubModeValue",
    "hubStyleValue",
    "hubReviewValue",
    "hubMascotValue",
    "hubStartupValue",
    "helpPanel",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const promise of [
    "不保存输入内容或优化历史",
    "应用前校验目标窗口与原文",
    "API Key 使用 Windows 加密存储",
  ]) {
    assert.match(html, new RegExp(promise));
  }
  assert.match(renderer, /function updateHubSummary\(/);
  for (const updater of [
    "updateStyleLabel",
    "updateModeLabel",
    "setMascot",
    "updateReviewModeLabel",
    "updateStartupLabel",
  ]) {
    const body = renderer.slice(
      renderer.indexOf(`function ${updater}`),
      renderer.indexOf("\n}", renderer.indexOf(`function ${updater}`)) + 2,
    );
    assert.match(body, /updateHubSummary\(\)/);
  }
});

test("round 5 exposes accessible tabs, selected states, and reduced-motion feedback", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const css = read("src/renderer/styles.css");

  assert.match(html, /class="hub-tabbar"[^>]*role="tablist"/);
  assert.equal((html.match(/class="hub-tab"/g) ?? []).length, 4);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 4);
  assert.match(renderer, /tab\.setAttribute\("aria-selected",\s*String\(selected\)\)/);
  assert.match(renderer, /tab\.tabIndex\s*=\s*selected\s*\?\s*0\s*:\s*-1/);
  assert.match(renderer, /event\.key\s*===\s*"ArrowRight"/);
  assert.match(renderer, /event\.key\s*===\s*"ArrowLeft"/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.hub-tab:focus-visible/);
});
