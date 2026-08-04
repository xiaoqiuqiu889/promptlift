import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

function pageSlice(html, page, nextPage) {
  const start = html.indexOf(`data-hub-page="${page}"`);
  const end = html.indexOf(`data-hub-page="${nextPage}"`, start);
  return html.slice(start, end);
}

test("round 6 adds one clear primary action inside the processing hub", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const css = read("src/renderer/styles.css");

  assert.match(html, /id="hubPrimaryAction"/);
  assert.match(html, /id="hubPrimaryActionTitle"[^>]*>优化当前输入</);
  assert.match(html, /只处理当前输入[^<]*不保存表达历史/);
  assert.match(renderer, /hubPrimaryAction\.addEventListener\("click"/);
  assert.match(renderer, /handleEnhance\(\)\.catch/);
  assert.match(
    css,
    /\.context-menu \.hub-primary-action\s*\{[^}]*color:\s*#fff;[^}]*background:\s*var\(--accent\)/s,
  );
});

test("round 7 turns the current-state overview into direct, accessible shortcuts", () => {
  const html = read("src/renderer/index.html");
  const css = read("src/renderer/styles.css");
  const summary = html.slice(
    html.indexOf('class="hub-summary"'),
    html.indexOf('class="hub-section-label"', html.indexOf('class="hub-summary"')),
  );

  assert.equal((summary.match(/class="hub-summary-action"/g) ?? []).length, 3);
  assert.match(summary, /data-menu-action="scenes"/);
  assert.match(summary, /data-menu-action="style"/);
  assert.match(summary, /data-menu-action="review"[^>]*role="switch"/);
  assert.match(css, /\.hub-summary-action:focus-visible/);
});

test("processing hub owns the scene selector and the bottom navigation has only three tabs", () => {
  const html = read("src/renderer/index.html");
  const process = pageSlice(html, "process", "services");
  const tabbar = html.slice(
    html.indexOf('class="hub-tabbar"'),
    html.indexOf("</nav>", html.indexOf('class="hub-tabbar"')),
  );

  assert.match(process, /id="hubSceneSelector"/);
  assert.equal((process.match(/data-hub-mode=/g) ?? []).length, 4);
  assert.equal((tabbar.match(/class="hub-tab"/g) ?? []).length, 3);
  assert.match(tabbar, />处理</);
  assert.match(tabbar, />服务</);
  assert.match(tabbar, />我的</);
  assert.doesNotMatch(tabbar, />场景</);
});

test("round 8 mirrors operation progress in the feature hub without adding a second task", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");

  assert.match(html, /id="hubTaskState"[^>]*aria-live="polite"/);
  assert.match(html, /id="hubPrimaryAction"[^>]*aria-busy="false"/);
  assert.match(renderer, /function updateHubOperationState\(/);
  assert.match(renderer, /hubPrimaryAction\.disabled\s*=\s*state\.phase\s*===\s*"loading"/);
  const statusBody = renderer.slice(
    renderer.indexOf("function setStatus"),
    renderer.indexOf("\n}", renderer.indexOf("function setStatus")) + 2,
  );
  assert.match(statusBody, /updateHubOperationState\(\)/);
});

test("round 9 places privacy and usage guidance with personal preferences, not model services", () => {
  const html = read("src/renderer/index.html");
  const services = pageSlice(html, "services", "profile");
  const profile = pageSlice(html, "profile", "__missing__");

  assert.doesNotMatch(services, /data-menu-action="help"/);
  assert.match(profile, /隐私与安全/);
  assert.match(profile, /data-menu-action="help"/);
  assert.match(profile, /本地保护/);
});

test("round 10 exposes honest model readiness instead of a generic configuration label", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");

  assert.match(html, /id="hubModelStateLabel"[^>]*aria-live="polite"/);
  assert.match(renderer, /hubModelStateLabel\.textContent\s*=\s*"已配置"/);
  assert.match(renderer, /hubModelStateLabel\.textContent\s*=\s*"待配置"/);
  assert.match(renderer, /hubModelStateLabel\.textContent\s*=\s*"仅本次"/);
});
