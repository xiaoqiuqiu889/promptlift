import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

test("scene and tier are one quiet settings group without duplicated scene cards", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");

  assert.doesNotMatch(html, />工作模式</);
  assert.doesNotMatch(html, /id="hubTabScenes"/);
  assert.doesNotMatch(html, /id="hubPageScenes"/);
  const processPage = html.slice(
    html.indexOf('data-hub-page="process"'),
    html.indexOf('data-hub-page="profile"'),
  );
  const expressionSettings = processPage.slice(
    processPage.indexOf('id="hubExpressionSettings"'),
    processPage.indexOf("</div>", processPage.indexOf('id="hubExpressionSettings"')) + 6,
  );
  assert.match(processPage, /表达设置/);
  assert.equal((expressionSettings.match(/<button class="hub-row"/g) ?? []).length, 2);
  assert.match(expressionSettings, /data-menu-action="scenes"/);
  assert.match(expressionSettings, /data-menu-action="style"/);
  assert.match(expressionSettings, /id="currentModeLabel"/);
  assert.match(expressionSettings, /id="currentStyleLabel"/);
  assert.doesNotMatch(processPage, /id="hubSceneSelector"|hub-scene-choice|data-hub-mode=/);
  assert.match(html, /id="modePanel"/);
  assert.equal((html.match(/class="mode-option"[^>]*data-hub-mode=/g) ?? []).length, 4);
  assert.match(renderer, /action === "scenes"[\s\S]*showPanel\(modePanel\)/);
  assert.doesNotMatch(renderer, /showHub\("scenes"\)/);
  assert.doesNotMatch(renderer, /state\.hub\s*=\s*"scenes"/);
  assert.doesNotMatch(renderer, /focusSceneSelector/);
});

test("expanded UI defaults to a readable size and typography scale", () => {
  const renderer = read("src/renderer/renderer.mjs");
  const css = read("src/renderer/styles.css");

  assert.match(renderer, /const DEFAULT_EXPANDED_WIDTH = 420/);
  assert.match(renderer, /const DEFAULT_EXPANDED_HEIGHT = 620/);
  assert.match(renderer, /api\.resize\(DEFAULT_EXPANDED_WIDTH,\s*DEFAULT_EXPANDED_HEIGHT/);
  assert.match(css, /\.hub-row > span:nth-child\(2\)[\s\S]*font-size:\s*14px/);
  assert.match(css, /\.hub-row small[\s\S]*font-size:\s*12px/);
  assert.match(css, /\.hub-tab-label[\s\S]*font-size:\s*12px/);
  assert.match(css, /\.hub-page[\s\S]*overflow-y:\s*auto/);
});

test("shortcut settings expose capture, save, reset, and active status", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const preload = read("src/preload.mjs");
  const main = read("src/main.mjs");

  for (const id of [
    "shortcutPanel",
    "shortcutCaptureButton",
    "shortcutSaveButton",
    "shortcutResetButton",
    "shortcutValue",
    "shortcutStatus",
    "currentShortcutLabel",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(preload, /shortcutGet:\s*"prompt:shortcut:get"/);
  assert.match(preload, /shortcutSet:\s*"prompt:shortcut:set"/);
  assert.match(main, /handleIpc\('prompt:shortcut:get'/);
  assert.match(main, /handleIpc\('prompt:shortcut:set'/);
  assert.match(renderer, /function beginShortcutCapture\(/);
  assert.match(renderer, /function handleShortcutKeydown\(/);
  assert.match(renderer, /api\.setShortcut/);
  assert.match(renderer, /api\.getShortcut/);
});
