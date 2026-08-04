import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

function pageSlice(html, page, nextPage) {
  const start = html.indexOf(`data-hub-page="${page}"`);
  const next = html.indexOf(`data-hub-page="${nextPage}"`, start);
  const end = next >= 0 ? next : html.length;
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

test("round 7 removes redundant page chrome and groups the two expression choices", () => {
  const html = read("src/renderer/index.html");
  const css = read("src/renderer/styles.css");
  const process = pageSlice(html, "process", "profile");
  const expressionSettings = process.slice(
    process.indexOf('id="hubExpressionSettings"'),
    process.indexOf("</div>", process.indexOf('id="hubExpressionSettings"')) + 6,
  );

  assert.doesNotMatch(html, /class="hub-heading"/);
  assert.doesNotMatch(html, /class="hub-summary"/);
  assert.doesNotMatch(css, /\.hub-summary(?:-action)?\b/);
  assert.match(expressionSettings, /data-menu-action="scenes"[\s\S]*data-menu-action="style"/);
  assert.equal((expressionSettings.match(/<button class="hub-row"/g) ?? []).length, 2);
  assert.match(css, /\.hub-expression-settings/);
});

test("processing hub owns one scene entry and the bottom navigation has only two tabs", () => {
  const html = read("src/renderer/index.html");
  const process = pageSlice(html, "process", "profile");
  const tabbar = html.slice(
    html.indexOf('class="hub-tabbar"'),
    html.indexOf("</nav>", html.indexOf('class="hub-tabbar"')),
  );

  assert.match(process, /data-menu-action="scenes"/);
  assert.equal((process.match(/data-hub-mode=/g) ?? []).length, 0);
  assert.equal((tabbar.match(/class="hub-tab"/g) ?? []).length, 2);
  assert.match(tabbar, />处理</);
  assert.match(tabbar, />我的</);
  assert.doesNotMatch(tabbar, />服务</);
  assert.doesNotMatch(tabbar, />场景</);
});

test("round 8 mirrors operation progress in the feature hub without adding a second task", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");

  assert.match(html, /id="hubTaskState"[^>]*class="hub-primary-state"[^>]*aria-live="polite"/);
  assert.match(html, /id="hubPrimaryAction"[^>]*aria-busy="false"/);
  assert.match(renderer, /function updateHubOperationState\(/);
  assert.match(renderer, /hubPrimaryAction\.disabled\s*=\s*state\.phase\s*===\s*"loading"/);
  const statusBody = renderer.slice(
    renderer.indexOf("function setStatus"),
    renderer.indexOf("\n}", renderer.indexOf("function setStatus")) + 2,
  );
  assert.match(statusBody, /updateHubOperationState\(\)/);
});

test("round 9 places privacy guidance and model services together under profile", () => {
  const html = read("src/renderer/index.html");
  const profile = pageSlice(html, "profile", "__missing__");

  assert.match(profile, /data-menu-action="configure"/);
  assert.match(profile, /data-menu-action="check"/);
  assert.match(profile, /data-menu-action="startup"/);
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
