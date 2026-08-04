import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const CLI_PATH = fileURLToPath(new URL('../scripts/prompt-eval.mjs', import.meta.url));
const REAL_RUNNER_PATH = fileURLToPath(new URL('../qa/prompt-eval/tokenhub-runner.mjs', import.meta.url));

const SOURCE = 'Preserve https://example.test/spec and make this request clear.';

function envelope(result) {
  return JSON.stringify({
    protocol: '2.0',
    mode: 'enhance',
    language: 'en',
    status: 'ok',
    result,
  });
}

async function writeFixture(root) {
  const baselinePath = path.join(root, 'baseline.jsonl');
  const candidatePath = path.join(root, 'candidate.jsonl');
  await writeFile(
    baselinePath,
    `${JSON.stringify({
      id: 'case-001',
      sourceText: SOURCE,
      response: envelope('Make this request clear.'),
      mode: 'enhance',
      language: 'en',
    })}\n`,
    'utf8',
  );
  await writeFile(
    candidatePath,
    `${JSON.stringify({
      id: 'case-001',
      sourceText: SOURCE,
      response: envelope('Preserve https://example.test/spec and make this request clear.'),
      mode: 'enhance',
      language: 'en',
    })}\n`,
    'utf8',
  );
  return { baselinePath, candidatePath };
}

test('CLI defaults to dry-run and never writes a target policy without --promote', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'prompt-lift-eval-cli-contract-'));
  try {
    const { baselinePath, candidatePath } = await writeFixture(root);
    const reportPath = path.join(root, 'report.json');
    const targetRoot = path.join(root, 'target');
    const candidatePolicy = path.join(root, 'candidate-policy.json');
    await writeFile(candidatePolicy, '{"promptVersion":"candidate-1"}\n', 'utf8');

    await execFileAsync(process.execPath, [
      CLI_PATH,
      '--baseline', baselinePath,
      '--candidate', candidatePath,
      '--output', reportPath,
      '--target-root', targetRoot,
      '--candidate-policy', candidatePolicy,
    ], { windowsHide: true });

    const summary = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(summary.promotion?.promoted, true);
    assert.equal(summary.privacy?.containsRawSource, false);
    assert.equal(summary.privacy?.containsCredentials, false);
    assert.equal(await exists(path.join(targetRoot, 'config', 'prompt-policy.json')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('--promote is an explicit write opt-in and requires the candidate policy input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'prompt-lift-eval-cli-promote-'));
  try {
    const { baselinePath, candidatePath } = await writeFixture(root);
    const reportPath = path.join(root, 'report.json');
    const targetRoot = path.join(root, 'target');
    const missingPolicy = path.join(root, 'missing-policy.json');

    await assert.rejects(
      execFileAsync(process.execPath, [
        CLI_PATH,
        '--baseline', baselinePath,
        '--candidate', candidatePath,
        '--output', reportPath,
        '--promote',
        '--target-root', targetRoot,
        '--candidate-policy', missingPolicy,
      ], { windowsHide: true }),
      /candidate.?policy|ENOENT|not found/i,
    );
    assert.equal(await exists(path.join(targetRoot, 'config', 'prompt-policy.json')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('--promote writes the candidate policy only after the three-percent gate passes', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'prompt-lift-eval-cli-promote-success-'));
  try {
    const { baselinePath, candidatePath } = await writeFixture(root);
    const reportPath = path.join(root, 'report.json');
    const targetRoot = path.join(root, 'target');
    const candidatePolicy = path.join(root, 'candidate-policy.json');
    const policyText = '{"promptVersion":"candidate-1","rules":["preserve source"]}\n';
    await writeFile(candidatePolicy, policyText, 'utf8');

    try {
      await execFileAsync('git', ['init', '--quiet', targetRoot], { windowsHide: true });
    } catch {
      context.skip('git is required to verify clean target-root promotion');
      return;
    }

    await execFileAsync(process.execPath, [
      CLI_PATH,
      '--baseline', baselinePath,
      '--candidate', candidatePath,
      '--output', reportPath,
      '--promote',
      '--target-root', targetRoot,
      '--candidate-policy', candidatePolicy,
    ], { windowsHide: true });

    const promotedPath = path.join(targetRoot, 'config', 'prompt-policy.json');
    assert.equal(await readFile(promotedPath, 'utf8'), policyText);
    const summary = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(summary.promotion?.mode, 'promote');
    assert.equal(summary.promotion?.promoted, true);
    assert.equal(summary.promotion?.targetPath, 'config/prompt-policy.json');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function exists(target) {
  try {
    await readFile(target);
    return true;
  } catch {
    return false;
  }
}

test('the real TokenHub runner takes credentials only from the environment', async () => {
  const runner = await readFile(REAL_RUNNER_PATH, 'utf8');
  assert.match(runner, /TOKENHUB_API_KEY/);
  assert.match(runner, /fetch\(endpoint/u);
  assert.match(runner, /thinking:\s*\{\s*type:\s*['"]disabled['"]/u);
  assert.doesNotMatch(runner, /sk-[a-z0-9]{8,}/iu);
  assert.doesNotMatch(runner, /authorization:\s*['"]Bearer\s/iu);
});
