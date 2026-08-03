import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import {
  QA_INPUT_HOST_TITLE,
  buildQaInputHostHtml,
  createInitialQaHostState,
} from "../scripts/qa-e2e-input-host.mjs";
import {
  AVATAR_ENTRY,
  ALT_ENTRY,
  TEST_PROMPTS,
  createStageTimeline,
  createIsolatedAppDataLayout,
  createEvidenceSummary,
  isPathInsideTempPrefix,
  sanitizeEvidenceValue,
} from "../scripts/qa-real-e2e.mjs";

test("QA input host contract exposes a real editable surface and exported state", () => {
  const html = buildQaInputHostHtml();
  assert.equal(QA_INPUT_HOST_TITLE, "External Chat QA Input Host");
  assert.doesNotMatch(QA_INPUT_HOST_TITLE, /prompt\s*(?:lift|pet)/iu);
  assert.match(html, /textarea/i);
  assert.match(html, /contenteditable/i);
  assert.match(html, /readonly/i);
  assert.match(html, /export|validation|state/i);

  const initial = createInitialQaHostState(TEST_PROMPTS.avatar);
  assert.equal(initial.title, QA_INPUT_HOST_TITLE);
  assert.equal(initial.text, TEST_PROMPTS.avatar);
  assert.equal(initial.status, "ready");
  assert.equal(initial.sensitive, false);
});

test("QA prompts retain the required immutable anchors", () => {
  for (const prompt of Object.values(TEST_PROMPTS)) {
    assert.match(prompt, /2026-08-10/);
    assert.match(prompt, /C:\\work\\app\.js/);
    assert.match(prompt, /https:\/\/example\.com\/spec/);
    assert.match(prompt, /不要修改 API/);
    assert.match(prompt, /[\u3400-\u9fff]/u);
  }
});

test("stage timelines remain independent for avatar and double-Alt entries", () => {
  const avatar = createStageTimeline(AVATAR_ENTRY);
  const alt = createStageTimeline(ALT_ENTRY);
  for (const timeline of [avatar, alt]) {
    assert.deepEqual(Object.keys(timeline), [
      "event",
      "loading",
      "capture",
      "model",
      "apply",
      "restore",
    ]);
    assert.equal(timeline.event, null);
  }
  assert.notEqual(avatar, alt);
});

test("evidence sanitization never serializes an API key or raw secret-shaped field", () => {
  const value = {
    apiKey: "sk-secret-must-not-escape",
    authorization: "Bearer sk-secret-must-not-escape",
    endpoint: "https://tokenhub.tencentmaas.com/v1",
    model: "deepseek-v4-flash",
  };
  const sanitized = sanitizeEvidenceValue(value);
  assert.equal(sanitized.apiKeySaved, true);
  assert.equal("apiKey" in sanitized, false);
  assert.equal("authorization" in sanitized, false);
  assert.equal(JSON.stringify(sanitized).includes("sk-secret"), false);
});

test("evidence summary reports real model metadata without raw prompt text", () => {
  const summary = createEvidenceSummary({
    model: "deepseek-v4-flash",
    endpoint: "https://tokenhub.tencentmaas.com/v1",
    apiKeySaved: true,
    calls: 1,
    rawPrompt: TEST_PROMPTS.avatar,
    entries: {
      [AVATAR_ENTRY]: { model: { returned: true, characters: 42 } },
      [ALT_ENTRY]: { model: { returned: false, characters: 0 } },
    },
  });
  assert.equal(summary.model, "deepseek-v4-flash");
  assert.equal(summary.apiKeySaved, true);
  assert.equal(summary.realModelCalls, 1);
  assert.equal(summary.entries[AVATAR_ENTRY].model.returned, true);
  assert.equal(JSON.stringify(summary).includes(TEST_PROMPTS.avatar), false);
});

test("temporary evidence paths must stay under the exact QA prefix", () => {
  const qaRoot = path.join(os.tmpdir(), "prompt-lift-qa-e2e-contract");
  assert.equal(isPathInsideTempPrefix(path.join(qaRoot, "evidence"), qaRoot), true);
  assert.equal(isPathInsideTempPrefix(path.join(os.tmpdir(), "other"), qaRoot), false);
  assert.equal(isPathInsideTempPrefix(path.join(qaRoot, "..", "outside"), qaRoot), false);
});

test("isolated Electron processes use separate APPDATA roots and product-name userData", () => {
  const layout = createIsolatedAppDataLayout(path.join(os.tmpdir(), "prompt-lift-qa-e2e-contract"));
  assert.match(layout.hostAppDataRoot, /host-user-data/u);
  assert.match(layout.promptAppDataRoot, /prompt-lift-user-data/u);
  assert.notEqual(layout.hostAppDataRoot, layout.promptAppDataRoot);
  assert.equal(layout.promptLiftUserDataPath, layout.promptAppDataRoot);
  assert.equal(layout.configDestination, path.join(layout.promptLiftUserDataPath, "prompt-lift-model.json"));
  assert.equal(layout.safeStorageStateDestination, path.join(layout.promptLiftUserDataPath, "Local State"));
});
