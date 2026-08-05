import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(relativePath) {
  try {
    await access(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

test("UI visual QA contract has an isolated preload and runner", async () => {
  assert.equal(await exists("scripts/qa-renderer-preload.mjs"), true);
  assert.equal(await exists("scripts/qa-ui-visual.mjs"), true);
});

test("UI visual QA uses trusted input, read-only DOM inspection, and masked mock credentials", async () => {
  const runner = await readFile(path.join(projectRoot, "scripts/qa-ui-visual.mjs"), "utf8");
  const preload = await readFile(path.join(projectRoot, "scripts/qa-renderer-preload.mjs"), "utf8");
  assert.match(runner, /webContents\.sendInputEvent/);
  assert.match(runner, /webContents\.capturePage/);
  assert.match(runner, /webContents\.executeJavaScript/);
  assert.match(runner, /trusted click missed target/);
  assert.match(runner, /hub-row-content-overflow/);
  assert.match(runner, /contextIsolation:\s*true/);
  assert.match(runner, /nodeIntegration:\s*false/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("promptLift"/);
  assert.match(preload, /apiKeyLength/);
  assert.doesNotMatch(runner, /Add-Type.*Automation|Get-UIAutomation|System\.Windows\.Automation/i);
});

test("UI visual QA locks the WorkBuddy-only tier and four merged scene color semantics", async () => {
  const runner = await readFile(path.join(projectRoot, "scripts/qa-ui-visual.mjs"), "utf8");
  assert.match(
    runner,
    /PROMPT_TIERS\s*=\s*Object\.freeze\(\["workbuddy"\]\)/s,
  );
  assert.match(
    runner,
    /WORK_MODES\s*=\s*Object\.freeze\(\[\s*"enhance",\s*"upward-communication",\s*"chat-polish",\s*"ppt-copy",?\s*\]\)/s,
  );
  assert.match(runner, /right-click mode toggle/);
  assert.match(runner, /root\?\.dataset\.mode/);
  assert.match(runner, /getPropertyValue\("--mode-accent"\)/);
  assert.match(runner, /new Set\(modeColors\)\.size !== WORK_MODES\.length/);
  assert.match(runner, /style-option\[data-style\].*strong/);
  assert.match(runner, /tierLabelSets/);
  assert.match(runner, /scene-selection-stays-in-process-hub/);
  assert.match(runner, /hub:\s*"process"/);
  assert.doesNotMatch(runner, /hub:\s*"scenes"/);
});

test("UI visual QA verifies two decoded PNG mascots plus the semantic CSS green knight", async () => {
  const runner = await readFile(path.join(projectRoot, "scripts/qa-ui-visual.mjs"), "utf8");
  assert.match(
    runner,
    /PNG_MASCOTS\s*=\s*Object\.freeze\(\[\s*"cockapoo",\s*"green-knight-pup",?\s*\]\)/s,
  );
  assert.match(
    runner,
    /CSS_MASCOTS\s*=\s*Object\.freeze\(\[\s*"classic-green-knight",?\s*\]\)/s,
  );
  assert.match(runner, /#mascotImage/);
  assert.match(runner, /root\?\.dataset\.mascot/);
  assert.match(runner, /image\.complete/);
  assert.match(runner, /image\.naturalWidth/);
  assert.match(runner, /\.mascot-option\[data-mascot=/);
  assert.match(runner, /mascot image failed to load/);
  assert.match(runner, /#mascotSprite\[data-mascot=\\?"classic-green-knight\\?"\]/);
  assert.match(runner, /mascot CSS sprite semantic contract/);
  assert.doesNotMatch(runner, /mascot(?:Image)?(?:Path|AbsolutePath)\s*:/i);
});

test("UI visual QA verifies fast auto-apply compacts while review mode exposes phase-safe actions", async () => {
  const runner = await readFile(path.join(projectRoot, "scripts/qa-ui-visual.mjs"), "utf8");
  assert.match(runner, /assertAbsent\("\[data-menu-action=\\?"result\\?"\]"\)/);
  assert.match(runner, /fast mode success.*auto apply.*compact/is);
  assert.match(runner, /review mode success.*primary result region/is);
  assert.match(
    runner,
    /REVIEW_ACTIONS\s*=\s*Object\.freeze\(\[\s*"#cancelButton",\s*"#restoreButton",\s*"#regenerateButton",\s*"#copyButton",\s*"#applyEditedButton",?\s*\]\)/s,
  );
  assert.match(runner, /REVIEW_ACTION_PHASES\s*=\s*Object\.freeze/);
  assert.match(runner, /review action must be visible and match phase availability/);
  assert.match(runner, /#resizeHandle/);
  assert.match(runner, /topbar menu entry must be visible and usable/);
  assert.match(runner, /"#resultPanel": false/);
  assert.match(runner, /"#resultPanel": true/);
  assert.doesNotMatch(runner, /menuAction\("result"/);
});

test("UI visual QA records, saves, and restores a custom global shortcut", async () => {
  const runner = await readFile(path.join(projectRoot, "scripts/qa-ui-visual.mjs"), "utf8");
  const preload = await readFile(path.join(projectRoot, "scripts/qa-renderer-preload.mjs"), "utf8");

  assert.match(runner, /custom-shortcut-record-and-reset/);
  assert.match(runner, /modifiers:\s*\["control",\s*"alt"\]/);
  assert.match(runner, /Control\+Alt\+P/);
  assert.match(runner, /DoubleAlt/);
  assert.match(runner, /summary-shortcut\.json/);
  assert.match(runner, /UI_SHORTCUT_RESULTS\.md/);
  assert.match(preload, /getShortcut\(\)/);
  assert.match(preload, /setShortcut\(shortcut\)/);
  assert.match(preload, /SHORTCUT_CONFLICT/);
});
