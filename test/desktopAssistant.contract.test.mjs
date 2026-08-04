import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

test("capture flow keeps the assistant visible while the target is read", () => {
  const main = read("src/main.mjs");
  const captureStart = main.indexOf("async function captureFromTarget");
  const ipcStart = main.indexOf("function registerIpc");
  const captureBlock = main.slice(captureStart, ipcStart);

  assert.doesNotMatch(captureBlock, /mainWindow\.hide\(\)/);
  assert.match(main, /handleIpc\('prompt:hide'/);
});

test("desktop assistant exposes left-click, right-click settings, and non-destructive recovery", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const preload = read("src/preload.mjs");
  const main = read("src/main.mjs");

  for (const id of [
    "petAvatar",
    "petAction",
    "contextMenu",
    "settingsPanel",
    "stylePanel",
    "modePanel",
    "resizeHandle",
    "collapseButton",
    "checkModelButton",
    "startupLabel",
    "restoreButton",
    "copyButton",
    "mascotImage",
    "mascotSprite",
    "mascotPanel",
    "compactModeBadge",
    "compactFeedback",
    "compactCancelButton",
    "promptProtocolLabel",
  ]) {
    assert.match(html, new RegExp("id=\"" + id + "\""));
  }
  assert.match(renderer, /petAvatar\.addEventListener\("click"/);
  assert.match(renderer, /petAction\.addEventListener\("click"/);
  assert.match(renderer, /petCard\.addEventListener\("contextmenu"/);
  assert.match(renderer, /function toggleWorkMode\(/);
  assert.match(renderer, /petCard\.addEventListener\("contextmenu",[\s\S]*toggleWorkMode\(\)/);
  assert.doesNotMatch(
    renderer,
    /petCard\.addEventListener\("contextmenu",[\s\S]*?contextMenu\.hidden\s*=\s*false/,
  );
  assert.match(renderer, /resizeHandle\.addEventListener\("click",[\s\S]*showContextMenu\(\)/);
  assert.match(renderer, /function showContextMenu\(/);
  assert.doesNotMatch(renderer, /dataset\.layer/);
  assert.match(
    renderer,
    /function showPanel\(panel\)[\s\S]*contextMenu\.hidden\s*=\s*true/,
    "child settings should replace the parent hub instead of creating a long stacked page",
  );
  assert.match(
    renderer,
    /function showPanel\(panel\)[\s\S]*panel\.scrollIntoView\(\{\s*block:\s*"nearest"/,
  );
  assert.match(
    html,
    /id="resultPanel"[\s\S]*?<\/section>\s*<nav id="contextMenu"[\s\S]*id="stylePanel"[\s\S]*id="systemPromptPanel"[\s\S]*<\/section>\s*<\/main>/,
  );
  assert.match(renderer, /api\.setMode/);
  assert.match(main, /isPromptMode\(mode\)/);
  assert.match(main, /isPromptMode\(persisted\.mode\)/);
  assert.match(renderer, /resizeHandle\.addEventListener\("pointerdown"/);
  assert.match(renderer, /collapseButton\.addEventListener\("click"/);
  assert.match(renderer, /hidePanels\(\{ collapse: false \}\)/);
  assert.match(renderer, /petAvatar\.addEventListener\("pointerdown"/);
  assert.match(renderer, /function beginAvatarDrag/);
  assert.match(renderer, /function finishAvatarDrag/);
  assert.match(renderer, /suppressAvatarClickUntil/);
  assert.match(renderer, /api\.startDrag/);
  assert.match(renderer, /api\.updateDrag/);
  assert.match(renderer, /api\.endDrag/);
  assert.match(renderer, /api\.checkModel\(/);
  assert.match(renderer, /api\.setStartup/);
  assert.match(renderer, /api\.restore/);
  assert.match(renderer, /api\.copy/);
  assert.doesNotMatch(renderer, /handleShowResult/);
  assert.doesNotMatch(renderer, /resultMenuButton/);
  assert.match(renderer, /compactCancelButton\.addEventListener/);
  assert.match(renderer, /compactFeedbackTimer/);
  assert.match(renderer, /function inferErrorCode/);
  assert.match(renderer, /MISSING_RESULT/);
  assert.match(renderer, /MODE_INVALID/);
  assert.match(main, /activeModelRequests/);
  assert.match(main, /\.abort\(\)/);
  assert.match(preload, /hide: "prompt:hide"/);
  assert.match(preload, /modeSet: "prompt:mode:set"/);
  assert.match(preload, /resize: "prompt:resize"/);
  assert.match(preload, /move: "prompt:move"/);
  assert.match(preload, /modelGet: "prompt:model:get"/);
  assert.match(renderer, /getModelConfig/);
  assert.match(html, /id="modelStorageStatus"/);
  assert.match(html, /data-style="faithful"/);
  assert.match(html, /系统提示词规范 v2/);
  assert.match(html, /检查并保存/);
  assert.match(renderer, /faithful:\s*"原意守护"/);
  assert.match(renderer, /setAttribute\("aria-pressed"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="dialog"/);
  assert.match(read("src/renderer/styles.css"), /prefers-reduced-motion/);
  assert.match(read("src/renderer/styles.css"), /:focus-visible/);
});

test("desktop assistant window is resizable and its outer styling has no shadows", () => {
  const main = read("src/main.mjs");
  const preload = read("src/preload.mjs");
  const renderer = read("src/renderer/renderer.mjs");
  const css = read("src/renderer/styles.css");

  assert.match(main, /resizable: true/);
  assert.match(main, /handleIpc\('prompt:resize'/);
  assert.match(main, /handleIpc\('prompt:move'/);
  assert.match(main, /ipcMain\.on\('prompt:drag:start'/);
  assert.match(main, /ipcMain\.on\('prompt:drag:move'/);
  assert.match(main, /ipcMain\.on\('prompt:drag:end'/);
  assert.match(main, /setImmediate\(applyPendingWindowDrag\)/);
  assert.match(preload, /dragStart: "prompt:drag:start"/);
  assert.match(preload, /ipcRenderer\.send\(\s*PROMPT_LIFT_CHANNELS\.dragMove/);
  assert.match(renderer, /api\.startDrag\(event\.screenX,\s*event\.screenY\)/);
  assert.match(renderer, /api\.updateDrag\(event\.screenX,\s*event\.screenY\)/);
  assert.match(renderer, /api\.endDrag\(event\.screenX,\s*event\.screenY\)/);
  const dragBlock = renderer.slice(
    renderer.indexOf("function beginAvatarDrag"),
    renderer.indexOf('resizeHandle.addEventListener("pointerdown"'),
  );
  assert.doesNotMatch(dragBlock, /requestAnimationFrame|api\.moveBy/);
  assert.match(main, /function moveWindowBy/);
  assert.match(main, /function clampBoundsToWorkArea/);
  assert.match(main, /createWindowStateStore/);
  assert.match(main, /scheduleWindowStateSave/);
  assert.match(main, /display-removed/);
  assert.match(main, /display-metrics-changed/);
  assert.match(main, /screen\.getDisplayMatching/);
  assert.match(main, /mainWindow\.setBounds\(nextBounds/);
  assert.match(main, /function isExpandedAssistantBounds/);
  assert.match(main, /!isExpandedAssistantBounds\(persistedWindowBounds\)/);
  assert.match(main, /input\.anchor === 'top-right'/);
  assert.match(renderer, /startHeight - event\.screenY \+ resizeSession\.startY/);
  assert.match(main, /width: 120/);
  assert.match(main, /height: 140/);
  assert.match(main, /minWidth: 88/);
  assert.match(main, /minHeight: 96/);
  assert.match(main, /showInactive\(\)/);
  assert.match(main, /mode: modelConfig\.mode/);
  assert.match(main, /createWindowsDoubleAltListener/);
  assert.match(main, /startDoubleAltListener/);
  assert.match(main, /safeStorage/);
  assert.match(main, /createEncryptedModelConfigStore/);
  assert.match(read("src/platform/windowsBridge.mjs"), /Prompt\\s\*\(\?:Lift\|Pet\)/);
  assert.match(read("src/platform/windowsBridge.mjs"), /WeChat\|WeCom/);
  assert.match(css, /data-view="compact"/);
  assert.match(css, /\.pet-flame/);
  assert.match(css, /\.pet-helmet/);
  assert.match(css, /\.pet-gem/);
  assert.match(css, /cursor: grab/);
  assert.match(css, /cursor: grabbing/);
  assert.doesNotMatch(css, /box-shadow\s*:/);
});

test("compact mode restores a small footprint without utility markers beside the pet", () => {
  const main = read("src/main.mjs");
  const renderer = read("src/renderer/renderer.mjs");
  const css = read("src/renderer/styles.css");

  assert.match(renderer, /DEFAULT_COMPACT_WIDTH/);
  assert.match(renderer, /readCompactSize/);
  assert.match(renderer, /api\.resize\(state\.compactWidth, state\.compactHeight, \{ persist: false \}\)/);
  assert.match(renderer, /function restoreCompactBounds/);
  assert.match(renderer, /setTimeout\(\(\) =>/);
  assert.match(read("src/preload.mjs"), /persist: options\.persist !== false/);
  assert.match(
    css,
    /data-view="compact"\] \.compact-mode-badge,\s*\.pet-shell\[data-view="compact"\] \.resize-handle\s*\{\s*display:\s*none/,
  );
  assert.match(css, /data-view="expanded"\] \.resize-handle\s*\{\s*display:\s*flex/);
  assert.match(css, /data-view="expanded"\] \.pet-card[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.context-menu\s*\{[\s\S]*position:\s*static[\s\S]*width:\s*100%/);
  assert.match(css, /\.floating-panel\s*\{[\s\S]*position:\s*static[\s\S]*inset:\s*auto/);
  assert.doesNotMatch(css, /data-layer="panel"/);
  assert.match(css, /data-view="compact"\] \.compact-feedback:not\(\[hidden\]\)[\s\S]*max-height: 42px[\s\S]*border-radius: 12px/);
  assert.match(css, /\.compact-feedback-text[\s\S]*-webkit-line-clamp: 2/);
  assert.match(renderer, /MIN_COMPACT_WIDTH = 112/);
  assert.match(renderer, /MIN_COMPACT_HEIGHT = 112/);

  const startup = main.slice(main.lastIndexOf("app.whenReady().then(async () =>"));
  assert.ok(startup.indexOf("registerIpc();") < startup.indexOf("window.showInactive();"));
});

test("desktop assistant is single-instance and tray-reopenable", () => {
  const main = read("src/main.mjs");

  assert.match(main, /app\.requestSingleInstanceLock\(\)/);
  assert.match(main, /app\.on\('second-instance'/);
  assert.match(main, /function reuseSingleAssistantWindow/);
  assert.match(main, /BrowserWindow\.getAllWindows\(\)/);
  assert.match(main, /window !== survivor/);
  assert.match(main, /tray\.on\('click'/);
  assert.match(main, /tray\.on\('double-click'/);
  assert.match(main, /function showAssistantMenu\(/);
  assert.match(main, /sendToWindow\('prompt:menu:open'/);
  assert.match(main, /function showAssistant/);
  assert.match(main, /captureTarget = foregroundTarget \?\? recentTarget/);
  assert.match(main, /await capturePrompt\(captureTarget\)/);
  assert.match(main, /event\.preventDefault\(\);\s*window\.hide\(\);/s);
  assert.match(main, /isQuitting = true/);
  const renderer = read("src/renderer/renderer.mjs");
  assert.doesNotMatch(renderer, /REPLACE_RECOVERY_FAILED/);
  assert.match(renderer, /replacementConfirmed/);
  assert.match(renderer, /state\.enhancedText\s*=\s*enhanced\.text/);
  assert.match(renderer, /if \(!state\.enhancedText\)/);
});

test("shortcut and tray actions run the complete enhancement flow", () => {
  const main = read("src/main.mjs");
  const renderer = read("src/renderer/renderer.mjs");
  const handleEnhance = renderer.slice(
    renderer.indexOf("async function handleEnhance"),
    renderer.indexOf("async function handleSaveModel"),
  );

  assert.match(main, /captureFromTarget\(undefined,\s*\{\s*autoEnhance:\s*true\s*\}\)/);
  assert.match(main, /autoEnhance:\s*input\?\.autoEnhance\s*===\s*true/);
  assert.match(main, /label:\s*'一键处理当前输入框'/);
  assert.match(renderer, /payload\?\.autoEnhance\s*===\s*true/);
  assert.match(renderer, /handleEnhance\(\{\s*capturedSource\s*\}\)/);
  const capturedHandler = renderer.slice(
    renderer.indexOf('api.onCaptured((payload) =>'),
    renderer.indexOf('if (typeof api?.onError'),
  );
  assert.doesNotMatch(capturedHandler, /state\.phase\s*!==\s*"loading"/);
  assert.match(capturedHandler, /state\.cancelled\s*=\s*false/);
  assert.match(handleEnhance, /if \(state\.requestId\)\s*\{\s*return;/);
  assert.doesNotMatch(handleEnhance, /if \(state\.phase === "loading"\)/);
  assert.match(renderer, /withOperationDeadline\(/);
  assert.match(read("src/preload.mjs"), /onMenuOpen\(handler\)/);
  assert.match(renderer, /api\.onMenuOpen\(\(\) => showContextMenu\(\)\)/);
});

test("double Alt regression is a mandatory pre-package delivery gate", () => {
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(
    packageJson.scripts["qa:double-alt"],
    "node scripts/qa-ui-visual.mjs --shortcut-only",
  );
  assert.match(packageJson.scripts["prepackage:win"], /qa:double-alt/);
  assert.match(packageJson.scripts["prepackage:win"], /qa:model-contract/);
  assert.match(packageJson.scripts["prepackage:win"], /npm test/);
});

test("compact pet does not steal the focused chat input before capture", () => {
  const main = read("src/main.mjs");
  const preload = read("src/preload.mjs");
  const renderer = read("src/renderer/renderer.mjs");

  assert.match(main, /focusable:\s*false/);
  assert.match(
    main,
    /mainWindow\.setFocusable\(isExpandedAssistantBounds\(\{\s*width:\s*nextWidth,\s*height:\s*nextHeight,\s*\}\)\)/s,
  );
  assert.match(main, /handleIpc\('prompt:target:remember',\s*rememberForegroundTarget\)/);
  assert.match(preload, /rememberTarget:\s*"prompt:target:remember"/);
  assert.match(preload, /rememberTarget\(\)\s*\{\s*return invoke\(PROMPT_LIFT_CHANNELS\.rememberTarget\)/s);
  assert.match(renderer, /function prepareTargetSnapshot\(/);
  assert.match(renderer, /petAvatar\.addEventListener\("pointerenter", prepareTargetSnapshot\)/);
  assert.match(renderer, /targetSnapshotPromise\s*=\s*api\.rememberTarget\(\)/);
  assert.match(renderer, /awaitTargetSnapshot\(\)\s*\.finally\(\(\) => handleEnhance\(\)/);
  assert.match(main, /TARGET_SNAPSHOT_TTL_MS\s*=\s*15_000/);
});

test("apply and restore use only the main-process replacement transaction", () => {
  const main = read("src/main.mjs");
  const preload = read("src/preload.mjs");

  assert.match(main, /replacementTransactions\.begin\(requestId,\s*\{\s*target: operationTarget,\s*original,/s);
  assert.match(main, /await replacePrompt\(text, transaction\.target,/);
  assert.match(main, /await replacePrompt\(transaction\.original, transaction\.target,/);
  assert.doesNotMatch(preload, /target:\s*normalizeTarget\(target\)/);
  assert.doesNotMatch(preload, /expectedText:\s*requireString/);
});

test("replacement is guarded by the captured original and operation token", () => {
  const main = read("src/main.mjs");
  const renderer = read("src/renderer/renderer.mjs");
  const preload = read("src/preload.mjs");

  assert.match(renderer, /expectedText:\s*(?:expectedTargetText\s*\|\|\s*)?state\.originalText/);
  assert.match(renderer, /operationId:\s*requestId/);
  assert.match(preload, /operationId/);
  assert.match(main, /REPLACEMENT_CANCELLED/);
  assert.match(main, /expectedText:\s*transaction\.expectedText/);
  assert.match(main, /replacementTransactions\.confirmApplied\(operationId, text\)/);
});

test("ipc failures preserve stable error codes across Electron invoke", () => {
  const main = read("src/main.mjs");
  const preload = read("src/preload.mjs");
  const protocol = read("src/core/ipcProtocol.mjs");

  assert.match(main, /function handleIpc\(/);
  assert.match(main, /serializeIpcError/);
  assert.match(preload, /reviveIpcResponse/);
  assert.match(preload, /revived\.error/);
  assert.match(protocol, /__promptLiftIpc/);
  assert.match(protocol, /code/);
});

test("model settings are safe, persistent, and renderer-restricted", () => {
  const main = read("src/main.mjs");
  const renderer = read("src/renderer/renderer.mjs");
  const html = read("src/renderer/index.html");

  assert.match(main, /async function setPromptStyle/);
  assert.match(main, /async function setPromptMode/);
  assert.match(main, /await persistModelConfig\(\)/);
  assert.match(renderer, /apiKeyInput\.value = ""/);
  assert.match(renderer, /targetWindowTitlePattern:\s*targetWindowTitlePattern\.value\.trim\(\)/);
  assert.match(main, /requestedPattern \|\| modelConfig\.targetWindowTitlePattern/);
  assert.match(main, /TARGET_PATTERN_MISMATCH/);
  assert.doesNotMatch(main, /captureTarget = targetWindowTitlePattern \|\| undefined/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'self'/);
  assert.match(main, /url\.protocol !== 'https:'/);
  assert.match(main, /persist:\s*false/);
  assert.match(main, /modelConfig = previousConfig/);
  assert.match(main, /setWindowOpenHandler/);
  assert.match(main, /will-navigate/);
  assert.match(main, /render-process-gone/);
  assert.match(main, /did-fail-load/);
  assert.match(main, /const window = new BrowserWindow/);
  assert.match(main, /if \(mainWindow === window\)/);
});

test("Windows package excludes repository history and development-only artifacts", () => {
  const packager = read("scripts/package-win.mjs");

  assert.match(packager, /import \{ auditPackageSurface \} from '\.\/packageSurfaceAudit\.mjs'/);
  assert.match(packager, /const stagingRoot/);
  assert.match(packager, /path\.join\(projectRoot, 'src'\)/);
  assert.match(packager, /path\.join\(stagingRoot, 'src'\)/);
  assert.match(packager, /path\.join\(stagingRoot, 'package\.json'\)/);
  assert.match(packager, /dir:\s*stagingRoot/);
  assert.doesNotMatch(packager, /dir:\s*projectRoot/);
  assert.match(packager, /await auditPackageSurface\(\{\s*archivePath:/s);
  assert.ok(
    packager.indexOf("await auditPackageSurface({")
      < packager.indexOf("await fs.rm(releaseRoot"),
    "the actual temporary package must be audited before replacing the release directory",
  );
});
