import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const read = (relativePath) => readFileSync(
  new URL(relativePath, projectRoot),
  "utf8",
);

test("repository publishes only the three supported runtime archives without generated QA evidence", () => {
  const tracked = execFileSync(
    "git",
    ["ls-files"],
    { cwd: projectRoot, encoding: "utf8" },
  ).trim().split(/\r?\n/u).filter(
    (file) => file && existsSync(new URL(file, projectRoot)),
  );
  const deliverables = tracked.filter((file) => file.startsWith("deliverables/"));
  const evidence = tracked.filter((file) => file.startsWith("qa/evidence/"));
  const qaDocuments = tracked.filter((file) => file.startsWith("qa/"));

  assert.deepEqual(deliverables, [
    "deliverables/Prompt-Lift-latest-darwin-arm64.zip",
    "deliverables/Prompt-Lift-latest-darwin-x64.zip",
    "deliverables/Prompt-Lift-latest-win32-x64.zip",
    "deliverables/SHA256SUMS.txt",
  ]);
  assert.deepEqual(evidence, []);
  assert.deepEqual(qaDocuments, [
    "qa/R8_ACCEPTANCE.md",
    "qa/prompt-eval/candidate-policy-v2.json",
    "qa/prompt-eval/candidate-policy.json",
    "qa/prompt-eval/golden.jsonl",
    "qa/prompt-eval/mock-runner.mjs",
    "qa/prompt-eval/tokenhub-runner.mjs",
  ]);
  assert.equal(tracked.includes("AGENTS.md"), false);
});

test("ignore and LFS rules keep future GitHub deliveries lean", () => {
  const gitignore = read(".gitignore");
  const attributes = read(".gitattributes");

  assert.match(gitignore, /deliverables\/\*/);
  assert.match(gitignore, /!deliverables\/Prompt-Lift-latest-win32-x64\.zip/);
  assert.match(gitignore, /!deliverables\/Prompt-Lift-latest-darwin-arm64\.zip/);
  assert.match(gitignore, /!deliverables\/Prompt-Lift-latest-darwin-x64\.zip/);
  assert.match(gitignore, /!deliverables\/SHA256SUMS\.txt/);
  assert.match(gitignore, /qa\/evidence\//);
  assert.match(gitignore, /qa\/UI_VISUAL_RESULTS\.md/);
  assert.match(gitignore, /qa\/UI_SHORTCUT_RESULTS\.md/);
  assert.match(gitignore, /^\/AGENTS\.md$/mu);
  assert.match(
    attributes,
    /^deliverables\/Prompt-Lift-latest-win32-x64\.zip filter=lfs diff=lfs merge=lfs -text$/mu,
  );
  assert.match(
    attributes,
    /^deliverables\/Prompt-Lift-latest-darwin-arm64\.zip filter=lfs diff=lfs merge=lfs -text$/mu,
  );
  assert.match(
    attributes,
    /^deliverables\/Prompt-Lift-latest-darwin-x64\.zip filter=lfs diff=lfs merge=lfs -text$/mu,
  );
  assert.doesNotMatch(attributes, /Prompt-Lift-20260804-r[456]/);
});
