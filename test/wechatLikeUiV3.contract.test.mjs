import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

test("round 11 resumes a pending review instead of starting a replacement task", () => {
  const renderer = read("src/renderer/renderer.mjs");

  assert.match(renderer, /function hasPendingReview\(/);
  assert.match(renderer, /function handleHubPrimaryAction\(/);
  const handler = renderer.slice(
    renderer.indexOf("function handleHubPrimaryAction"),
    renderer.indexOf("\n}", renderer.indexOf("function handleHubPrimaryAction")) + 2,
  );
  assert.match(handler, /hasPendingReview\(\)/);
  assert.match(handler, /hidePanels\(\{\s*collapse:\s*false\s*\}\)/);
  assert.match(handler, /resultPanel\.hidden\s*=\s*false/);
  assert.match(renderer, /hubPrimaryActionTitle\.textContent[\s\S]*"继续审阅"/);
});

test("round 12 explains the active apply policy next to the primary action", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");

  assert.match(html, /id="hubPrivacyNote"/);
  assert.match(renderer, /hubPrivacyNote\.textContent\s*=\s*state\.reviewMode/);
  assert.match(renderer, /先审阅再决定回填/);
  assert.match(renderer, /通过校验后安全回填/);
  assert.match(renderer, /不保存表达历史/);
});

test("round 13 exposes an honest session connection state for model checks", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");

  assert.match(html, /id="hubModelCheckLabel"[^>]*aria-live="polite"[^>]*>未检查</);
  assert.match(renderer, /modelConnection:\s*"unchecked"/);
  assert.match(renderer, /function updateModelConnectionLabel\(/);
  for (const label of ["未检查", "检查中", "已连接", "检查失败"]) {
    assert.match(renderer, new RegExp(`"${label}"`));
  }
  assert.match(renderer, /state\.modelConnection\s*=\s*"connected"/);
  assert.match(renderer, /state\.modelConnection\s*=\s*"error"/);
});

test("round 14 marks edited model settings as pending until they are saved", () => {
  const renderer = read("src/renderer/renderer.mjs");

  assert.match(renderer, /modelConfigDirty:\s*false/);
  const changed = renderer.slice(
    renderer.indexOf("function markModelChanged"),
    renderer.indexOf("\n}", renderer.indexOf("function markModelChanged")) + 2,
  );
  assert.match(changed, /state\.modelConfigDirty\s*=\s*true/);
  assert.match(changed, /updateModelStorageLabel\(\)/);
  assert.match(renderer, /hubModelStateLabel\.textContent\s*=\s*"待保存"/);
  assert.match(renderer, /配置已修改，保存或检查后生效/);
  assert.match(renderer, /state\.modelConfigDirty\s*=\s*false/);
});

test("round 15 mirrors the selected mascot in the personal identity area", () => {
  const html = read("src/renderer/index.html");
  const renderer = read("src/renderer/renderer.mjs");
  const css = read("src/renderer/styles.css");

  assert.match(html, /id="profileMascotImage"/);
  assert.match(html, /id="profileMascotFallback"/);
  assert.match(renderer, /profileMascotImage\.setAttribute\("src",\s*presentation\.asset\)/);
  assert.match(renderer, /profileMascotImage\.hidden\s*=\s*usesCssSprite/);
  assert.match(renderer, /profileMascotFallback\.hidden\s*=\s*!usesCssSprite/);
  assert.match(css, /\.profile-avatar img\s*\{[^}]*object-fit:\s*contain/s);
});
