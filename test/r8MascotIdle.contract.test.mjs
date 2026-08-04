import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function balancedBlock(source, headerPattern) {
  const match = headerPattern.exec(source);
  assert.ok(match, `missing CSS block matching ${headerPattern}`);
  const openingBrace = source.indexOf("{", match.index + match[0].length);
  assert.notEqual(openingBrace, -1, `missing opening brace for ${headerPattern}`);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openingBrace + 1, index);
      }
    }
  }
  assert.fail(`unterminated CSS block matching ${headerPattern}`);
}

function spanRangeWithId(html, id) {
  const tokens = /<span\b[^>]*>|<\/span\s*>/giu;
  const stack = [];
  let token;
  while ((token = tokens.exec(html)) !== null) {
    if (token[0].startsWith("</")) {
      const opening = stack.pop();
      if (opening?.id === id) {
        return {
          openingTag: opening.tag,
          start: opening.index,
          end: tokens.lastIndex,
          contents: html.slice(opening.index, tokens.lastIndex),
        };
      }
      continue;
    }
    stack.push({
      id: token[0].match(/\bid="([^"]+)"/u)?.[1],
      index: token.index,
      tag: token[0],
    });
  }
  return undefined;
}

const idleKeyframes = Object.freeze([
  "pet-idle-breathe",
  "pet-idle-curious",
  "pet-idle-twitch",
]);

test("compact mascot exposes one inert idle rig around both PNG and CSS mascots", () => {
  const html = read("src/renderer/index.html");
  const rig = spanRangeWithId(html, "mascotIdleRig");

  assert.ok(rig, "compact mascot must expose #mascotIdleRig");
  assert.match(rig.openingTag, /\bclass="[^"]*\bmascot-idle-rig\b[^"]*"/u);
  assert.match(rig.openingTag, /\baria-hidden="true"/u);
  assert.match(rig.contents, /\bid="mascotImageFrame"/u);
  assert.match(rig.contents, /\bid="mascotSprite"/u);
  assert.ok(
    html.indexOf('id="resizeHandle"') > rig.end,
    "the top-right resize/menu target must remain outside the animated rig",
  );
});

test("compact idle state provides three slow bounded mascot motions", () => {
  const css = read("src/renderer/styles.css");

  for (const name of idleKeyframes) {
    const body = balancedBlock(
      css,
      new RegExp(`@keyframes\\s+${name}\\b`, "u"),
    );
    assert.match(body, /(?:transform|translate|rotate|scale)\s*:/u);
    assert.doesNotMatch(
      body,
      /(?:^|[;{])\s*(?:inset|left|right|top|bottom|width|height)\s*:/mu,
      `${name} must not animate layout or hit targets`,
    );
    assert.doesNotMatch(
      body,
      /(?:filter|clip-path|mask(?:-image)?|background(?:-image)?)\s*:/u,
      `${name} must not damage transparent mascot rendering`,
    );

    const pixels = [...body.matchAll(/(-?\d+(?:\.\d+)?)px\b/gu)]
      .map((match) => Math.abs(Number(match[1])));
    assert.ok(
      pixels.every((value) => value <= 4),
      `${name} displacement must stay within 4px`,
    );

    const degrees = [...body.matchAll(/(-?\d+(?:\.\d+)?)deg\b/gu)]
      .map((match) => Math.abs(Number(match[1])));
    assert.ok(
      degrees.every((value) => value <= 5),
      `${name} rotation must stay within 5deg`,
    );

    const scales = [...body.matchAll(/\bscale(?:X|Y)?\(\s*(\d+(?:\.\d+)?)\s*\)/gu)]
      .map((match) => Number(match[1]));
    assert.ok(
      scales.every((value) => value >= 0.96 && value <= 1.04),
      `${name} scale must stay between 0.96 and 1.04`,
    );

    const animation = css.match(
      new RegExp(
        `\\.pet-shell\\[data-view="compact"\\]\\[data-state="idle"\\][\\s\\S]*?`
          + `animation\\s*:\\s*${name}\\s+(\\d+(?:\\.\\d+)?)(ms|s)[^;]*;`,
        "u",
      ),
    );
    assert.ok(animation, `${name} must run only from the compact idle state`);
    const durationMs = Number(animation[1]) * (animation[2] === "s" ? 1_000 : 1);
    assert.ok(
      durationMs >= 2_400 && durationMs <= 12_000,
      `${name} duration must be calm and bounded (2.4s–12s)`,
    );
  }
});

test("idle motion stops for reduced motion and pauses during pointer interaction", () => {
  const css = read("src/renderer/styles.css");
  const reducedMotion = balancedBlock(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)/u,
  );

  assert.match(reducedMotion, /\.mascot-idle-rig/u);
  assert.match(reducedMotion, /animation\s*:\s*none\s*!important/u);
  assert.match(reducedMotion, /transform\s*:\s*none\s*!important/u);
  assert.match(
    css,
    /data-dragging="true"[\s\S]{0,360}\.mascot-idle-rig[\s\S]{0,240}(?:animation-play-state\s*:\s*paused|animation\s*:\s*none)/u,
  );
  assert.match(
    css,
    /\.pet-avatar:hover[^{]*\.mascot-idle-rig[\s\S]{0,240}(?:animation-play-state\s*:\s*paused|animation\s*:\s*none)/u,
  );
});

test("idle rig preserves transparent image rendering and pointer hit ownership", () => {
  const css = read("src/renderer/styles.css");
  const rig = balancedBlock(css, /^\.mascot-idle-rig\s*$/mu);
  const image = balancedBlock(css, /^\.pet-mascot-image\s*$/mu);
  const transparentPup = balancedBlock(
    css,
    /^\.pet-shell\[data-mascot="green-knight-pup"\]\s+\.pet-mascot-frame\s*$/mu,
  );

  assert.match(rig, /pointer-events\s*:\s*none/u);
  assert.match(rig, /scale\s*:\s*1/u);
  assert.match(
    css,
    /\.pet-shell\[data-view="compact"\]\s+\.mascot-idle-rig\s*\{[^}]*scale\s*:\s*var\(--pet-scale,\s*1\)/u,
    "compact scaling must not leak into the expanded header",
  );
  assert.match(image, /object-fit\s*:\s*contain/u);
  assert.match(image, /pointer-events\s*:\s*none/u);
  assert.doesNotMatch(
    image,
    /(?:filter|clip-path|mask(?:-image)?|background(?:-image)?)\s*:/u,
  );
  assert.match(transparentPup, /background\s*:\s*transparent/u);
  assert.match(transparentPup, /overflow\s*:\s*visible/u);
});

test("visual QA records computed idle animation state and desktop clipping", () => {
  const qa = read("scripts/qa-ui-visual.mjs");

  assert.match(qa, /readMascotIdleState/u);
  assert.match(qa, /\.getAnimations\(\)/u);
  assert.match(qa, /animationName/u);
  assert.match(qa, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/u);
  assert.match(qa, /mascotRect/u);
  assert.match(qa, /avatarRect/u);
  assert.match(qa, /idle-mascot-desktop-clipping/u);
  assert.match(qa, /compact-idle-motion/u);
  assert.match(qa, /elementFromPoint/u);
  assert.match(qa, /closestAvatar/u);
  assert.match(qa, /closestHandle/u);
});
