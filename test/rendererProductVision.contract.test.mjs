import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

test("renderer exposes four expression recipes without adding a hot-path choice", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  for (const mode of ["enhance", "upward-communication", "chat-polish", "ppt-copy"]) {
    assert.match(html, new RegExp(`data-hub-mode="${mode}"`));
    assert.match(renderer, new RegExp(`"${mode}"`));
  }
  assert.match(renderer, /petAvatar\.addEventListener\("click"/);
  assert.match(renderer, /payload\?\.autoEnhance\s*===\s*true/);
  assert.match(
    renderer,
    /function compactFeedbackMessage\([\s\S]*message\.startsWith\("场景已切换"\)[\s\S]*MODE_LABELS\[state\.mode\]/u,
    "compact feedback must reveal the scene selected by the zero-window right-click cycle",
  );
});

test("processing hub prioritizes optimization tier and keeps scene changes in the merged page", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const menuStart = html.indexOf('<nav id="contextMenu"');
  const menu = html.slice(menuStart, html.indexOf("</nav>", menuStart));
  const actions = [...menu.matchAll(/data-menu-action="([^"]+)"/g)]
    .map((match) => match[1]);
  const handleMode = renderer.slice(
    renderer.indexOf("async function handleMode"),
    renderer.indexOf("async function handleStartupToggle"),
  );

  assert.deepEqual(actions.slice(0, 2), ["scenes", "style"]);
  assert.match(
    handleMode,
    /if \(returnToMenu\)\s*\{\s*showContextMenu\(\);\s*\}\s*else\s*\{\s*hidePanels\(\);/s,
  );
  assert.match(
    renderer,
    /modePanel\.addEventListener\("click"[\s\S]*handleMode\(hubMode,\s*\{\s*returnToMenu:\s*true\s*\}\)/,
  );
  assert.match(renderer, /state\.hub\s*=\s*"process"/);
  assert.doesNotMatch(renderer, /state\.hub\s*=\s*"scenes"/);
});

test("prompt style UI exposes WorkBuddy as the only tier and migrates every legacy value", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const styleValues = [...html.matchAll(/class="style-option"[^>]*data-style="([^"]+)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(styleValues, ["workbuddy"]);
  assert.deepEqual(
    [...html.matchAll(/data-system-style="([^"]+)"/g)].map((match) => match[1]),
    ["workbuddy"],
  );
  assert.match(html, /<strong>WorkBuddy<\/strong>/);
  assert.doesNotMatch(html, /data-style="(?:faithful|concise|professional|creative)"/);
  assert.doesNotMatch(html, /data-system-style="(?:faithful|concise|professional|creative)"/);
  assert.match(renderer, /LEGACY_STYLE_ALIASES/);
  for (const legacyStyle of ["balanced", "detailed", "faithful", "concise", "professional", "creative"]) {
    assert.match(renderer, new RegExp(`${legacyStyle}:\\s*"workbuddy"`));
  }
  assert.match(renderer, /normalizeStyle\(savedConfig\.style\)/);
});

test("each work mode presents one scene-specific WorkBuddy contract", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const styleValues = [...html.matchAll(/class="style-option"[^>]*data-style="([^"]+)"/g)]
    .map((match) => match[1]);

  assert.deepEqual(styleValues, ["workbuddy"]);
  assert.match(renderer, /MODE_STYLE_PRESENTATION/);
  assert.equal(
    (renderer.match(/workbuddy:\s*Object\.freeze\(\{/gu) ?? []).length,
    4,
    "all four scenes must define one WorkBuddy presentation",
  );
  assert.match(
    renderer,
    /function updateStyleLabel\(\)[\s\S]*button\.querySelector\("strong"\)[\s\S]*button\.querySelector\("span"\)/,
  );
  assert.match(
    renderer,
    /function updateModeLabel\(\)[\s\S]*updateStyleLabel\(\)/,
    "switching mode must refresh the WorkBuddy scene contract immediately",
  );
});

test("mode state colors the mascot frame without recoloring the source image", () => {
  const renderer = read("src/renderer/renderer.mjs");
  const css = read("src/renderer/styles.css");

  assert.match(renderer, /root\.dataset\.mode\s*=\s*state\.mode/);
  for (const [mode, color] of [
    ["enhance", "#07c160"],
    ["upward-communication", "#3478f6"],
    ["chat-polish", "#f59a23"],
    ["ppt-copy", "#8b5cf6"],
  ]) {
    assert.match(
      css,
      new RegExp(`data-mode="${mode}"[^}]*--mode-accent:\\s*${color}`, "s"),
    );
  }
  assert.match(css, /\.pet-mascot-frame[\s\S]*border:[^;]*var\(--mode-accent\)/);
  assert.match(css, /\.pet-mascot-image[\s\S]*object-fit:\s*contain/);
  assert.match(css, /\.pet-flame\s*\{[^}]*background:\s*var\(--mode-accent\)/s);
  assert.match(css, /\.pet-gem\s*\{[^}]*background:\s*var\(--mode-accent\)/s);
  assert.doesNotMatch(css, /\.pet-mascot-image[\s\S]{0,240}\bfilter\s*:/);
});

test("green knight pup is frameless and the Q cockapoo option is removed", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const css = read("src/renderer/styles.css");

  assert.doesNotMatch(html, /cockapoo-chibi|可卡布犬 · Q版/);
  assert.doesNotMatch(renderer, /cockapoo-chibi/);
  assert.equal(
    existsSync(new URL("../src/renderer/assets/mascots/cockapoo-chibi.png", import.meta.url)),
    false,
  );
  assert.match(
    css,
    /\.pet-shell\[data-mascot="green-knight-pup"\]\s+\.pet-mascot-frame\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*background:\s*transparent;[^}]*overflow:\s*visible;/s,
  );
});

test("result menu shortcut is removed while the primary result actions remain", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");

  assert.doesNotMatch(html, /id="resultMenuButton"|data-menu-action="result"|查看增强结果/);
  assert.doesNotMatch(renderer, /resultMenuButton|handleShowResult|action === "result"/);
  for (const id of ["resultPanel", "restoreButton", "copyButton", "applyEditedButton"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("fast success returns compact while review success keeps the first-level editor visible", () => {
  const renderer = read("src/renderer/renderer.mjs");
  const handleEnhance = renderer.slice(
    renderer.indexOf("async function handleEnhance"),
    renderer.indexOf("async function handleApplyEdited"),
  );

  assert.match(handleEnhance, /replace:\s*!state\.reviewMode/);
  assert.match(
    handleEnhance,
    /if \(state\.reviewMode\)\s*\{\s*resultPanel\.hidden = false;\s*expandAssistant\(\);\s*\}\s*else\s*\{\s*collapseAssistant\(\);/s,
  );
  assert.doesNotMatch(
    handleEnhance,
    /resultPanel\.hidden = false;\s*expandAssistant\(\);\s*updateMeta\(\)/,
    "the fast path must not unconditionally open the review editor",
  );
});

test("review result keeps explicit actions and supports non-destructive discard", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  for (const [id, label] of [
    ["cancelButton", "放弃"],
    ["restoreButton", "恢复原文"],
    ["regenerateButton", "重新生成"],
    ["copyButton", "复制"],
    ["applyEditedButton", "应用"],
  ]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*>${label}</button>`));
  }
  assert.match(renderer, /const canDiscardReview/);
  assert.match(renderer, /async function handleDiscardReview/);
  assert.match(
    renderer,
    /handleDiscardReview\(\)[\s\S]*api\.cancel\(operationId\)[\s\S]*resultPanel\.hidden = true[\s\S]*collapseAssistant\(\)/,
  );
  const discardReview = renderer.slice(
    renderer.indexOf("async function handleDiscardReview"),
    renderer.indexOf("async function handleCancel"),
  );
  assert.doesNotMatch(
    discardReview,
    /if \(state\.requestId\s*\|\|/,
    "a visible completed review must remain discardable while the request finally block settles",
  );
  assert.match(renderer, /cancelButton\.disabled\s*=\s*!\(canCancelRequest \|\| canDiscardReview\)/);

  const showMenu = renderer.slice(
    renderer.indexOf("function showContextMenu"),
    renderer.indexOf("function hidePanels"),
  );
  assert.doesNotMatch(showMenu, /resultPanel\.hidden|enhancedText\s*=|generationOperationId\s*=/);
  for (const action of ["scenes", "mascot", "shortcut", "review", "configure", "style", "check", "startup", "quit"]) {
    assert.match(html, new RegExp(`data-menu-action="${action}"`));
  }
});

test("mascot picker keeps the original cockapoo and both green knights", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const css = read("src/renderer/styles.css");
  const runtimeAsset = readFileSync(
    new URL("../src/renderer/assets/mascots/green-knight-pup.png", import.meta.url),
  );

  assert.match(html, /id="mascotImage"/);
  assert.match(html, /id="mascotSprite"[^>]*data-mascot="classic-green-knight"[^>]*hidden/);
  assert.match(html, /src="\.\/assets\/mascots\/cockapoo\.png"/);
  assert.match(html, /data-menu-action="mascot"/);
  assert.match(html, /id="mascotPanel"/);
  for (const [value, label, asset] of [
    ["cockapoo", "可卡布犬 · 原风格", "cockapoo.png"],
    ["green-knight-pup", "绿色骑士小狗", "green-knight-pup.png"],
  ]) {
    assert.match(html, new RegExp(`data-mascot="${value}"`));
    assert.match(html, new RegExp(`<strong>${label}</strong>`));
    assert.match(renderer, new RegExp(`assets/mascots/${asset.replace(".", "\\.")}`));
  }
  assert.match(html, /data-mascot="classic-green-knight"[\s\S]*<strong>绿色骑士<\/strong>/);
  for (const cssPart of ["pet-flame", "pet-helmet", "pet-gem"]) {
    assert.match(html, new RegExp(`id="mascotSprite"[\\s\\S]*class="[^"]*${cssPart}`));
  }
  assert.match(renderer, /"classic-green-knight"[\s\S]*kind:\s*"css"/);
  assert.match(renderer, /mascotImageFrame\.hidden\s*=\s*usesCssSprite/);
  assert.match(renderer, /mascotSprite\.hidden\s*=\s*!usesCssSprite/);
  assert.match(
    css,
    /\.pet-shell\[data-mascot="green-knight-pup"\]\s+\.pet-mascot-frame\s*\{[^}]*background:\s*transparent;/s,
  );
  assert.equal(runtimeAsset.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(runtimeAsset.byteLength > 1024);
  assert.match(renderer, /MASCOT_STORAGE_KEY/);
  assert.match(renderer, /mascot:\s*readMascot\(\)/);
  assert.match(renderer, /localStorage\.setItem\(MASCOT_STORAGE_KEY/);
  assert.match(renderer, /mascotImage\.addEventListener\("error"/);
  assert.match(renderer, /setMascot\("cockapoo"/);
  assert.doesNotMatch(html, /幽魂骑士|精绝女王|spectral-rider|desert-queen/);
});

test("review mode offers editable diff, regenerate, and CAS apply", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  for (const id of [
    "reviewModeButton",
    "cancelButton",
    "restoreButton",
    "originalPreview",
    "diffPreview",
    "enhancedPrompt",
    "applyEditedButton",
    "regenerateButton",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(renderer, /REVIEW_MODE_STORAGE_KEY/);
  assert.match(renderer, /replace:\s*!state\.reviewMode/);
  assert.match(
    renderer,
    /let expectedTargetText[\s\S]*const sourceText = capturedSource\?\.text \?\? await captureSource\(\);[\s\S]*if \(capturedSource === undefined\)\s*\{\s*expectedTargetText = state\.originalText;/u,
    "a fresh left-click capture must replace any prior appliedText CAS baseline",
  );
  assert.match(renderer, /async function handleApplyEdited/);
  assert.match(renderer, /expectedText:\s*state\.replacementConfirmed[\s\S]*state\.appliedText[\s\S]*state\.originalText/);
  assert.match(
    renderer,
    /api\.restore\(state\.originalText,\s*state\.target,\s*\{[\s\S]*expectedText:\s*state\.appliedText\s*\|\|\s*undefined/,
    "restore must compare against the last text actually applied, not unsaved textarea edits",
  );
  assert.match(renderer, /async function handleRegenerate/);
  assert.match(renderer, /function renderDiff\(/);
  assert.match(renderer, /document\.createElement\("del"\)/);
  assert.match(renderer, /document\.createElement\("ins"\)/);
  assert.doesNotMatch(renderer, /(?:diffPreview|originalPreview)\.innerHTML\s*=/);
});

test("needs_input is bounded, inline, and clarification regenerates in review mode", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  assert.match(html, /id="needsInputPanel"/);
  assert.match(html, /id="missingFields"/);
  assert.match(html, /id="clarificationInput"/);
  assert.match(renderer, /error\?\.details/);
  assert.match(renderer, /\.slice\(0,\s*3\)/);
  assert.match(renderer, /state\.reviewMode\s*=\s*true/);
  assert.match(renderer, /clarification:\s*supplement/);
  assert.doesNotMatch(renderer, /sourceWithClarification|--- 用户补充信息/);
});

test("expanded UI uses a light flat palette and no decorative effects", () => {
  const html = read("src/renderer/index.html");
  const css = read("src/renderer/styles.css");
  assert.match(html, /name="color-scheme" content="light"/);
  assert.match(css, /--surface:\s*#f5f5f5/);
  assert.match(css, /--accent:\s*#07c160/);
  assert.match(css, /--text:\s*#191919/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/);
  assert.match(css, /data-view="compact"\]\[data-state="idle"\][^{]*\.mascot-idle-rig/);
  assert.doesNotMatch(
    css,
    /data-view="expanded"[^{]*\{[^}]*\banimation\s*:/s,
    "calm mascot motion is compact-only; expanded product surfaces remain still",
  );
  assert.doesNotMatch(css, /box-shadow\s*:/);
});
