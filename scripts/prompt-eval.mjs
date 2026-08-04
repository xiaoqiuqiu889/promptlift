#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  aggregateMetrics,
  createSummary,
  evaluateCase,
  evaluatePromotion,
} from './prompt-eval/metrics.mjs';

const SECRET_PATTERN = /(?:sk-[a-z0-9_-]{8,}|api[_-]?key|authorization|bearer\s+[a-z0-9._-]{8,})/iu;
const RAW_TEXT_KEYS = new Set(['sourceText', 'rawOutput', 'response', 'modelOutput', 'apiKey', 'authorization']);

function usage() {
  return [
    'Usage:',
    '  node scripts/prompt-eval.mjs --baseline baseline.jsonl --candidate candidate.jsonl [options]',
    '',
    'Options:',
    '  --baseline <path>          Baseline JSONL results.',
    '  --candidate <path>         Challenger JSONL results.',
    '  --dataset <path>           Fixture JSONL for an injected runner.',
    '  --runner <path>            ESM module exporting runCase({ fixture, variant, policyText }).',
    '  --baseline-policy <path>   Policy text supplied to the runner for baseline.',
    '  --candidate-policy <path>  Candidate policy JSON used by the runner and promotion.',
    '  --output <path>            Privacy-safe JSON summary path.',
    '  --threshold <ratio>        Relative promotion threshold; default 0.03.',
    '  --min-rating-delta <n>     Minimum unbounded pairwise rating delta; default 20.',
    '  --streak-state <path>      Privacy-safe state file for consecutive gate passes.',
    '  --required-passes <n>      Consecutive passes required; default 2 with --streak-state.',
    '  --repeats <n>              Independent real-model repeats per fixture; default 1.',
    '  --promote                  Enable policy write-back after the gate passes.',
    '  --target-root <path>       Clean main-worktree root for --promote.',
    '  --dry-run                  Explicitly retain dry-run behavior (the default).',
    '  --help                     Show this help.',
  ].join('\n');
}

function parseArgs(argv) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'help' || key === 'promote' || key === 'dry-run') {
      flags.add(key);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    values[key] = value;
    index += 1;
  }
  return { values, flags };
}

async function readJsonLines(filePath) {
  const content = await readFile(filePath, 'utf8');
  const rows = [];
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL at ${filePath}:${index + 1}: ${error.message}`);
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`JSONL row ${index + 1} must be an object.`);
    }
    rows.push(row);
  }
  if (rows.length === 0) throw new Error(`JSONL is empty: ${filePath}`);
  return rows;
}

function responseForRow(row) {
  return row.response ?? row.modelOutput ?? row.output;
}

function evaluateRows(rows) {
  return rows.map((row, index) => evaluateCase({
    sourceText: typeof row.sourceText === 'string' ? row.sourceText : '',
    response: responseForRow(row),
    protocolVersion: row.protocolVersion,
    mode: row.mode,
    language: row.language,
    expectedStatuses: row.expectedStatuses,
    maxExpansionRatio: row.maxExpansionRatio,
    allowNewScenarios: row.allowNewScenarios,
    hard: row.hard,
    semantic: row.semantic,
    task: row.task,
    pairwise: row.pairwise,
    caseId: row.id ?? `case-${index + 1}`,
  }));
}

function assertAlignedCases(baselineRows, candidateRows) {
  const collectIds = (rows, label) => {
    const ids = rows.map((row, index) => String(row.id ?? `case-${index + 1}`));
    const unique = new Set(ids);
    if (unique.size !== ids.length) throw new Error(`${label} contains duplicate case ids.`);
    return unique;
  };
  const baselineIds = collectIds(baselineRows, 'baseline');
  const candidateIds = collectIds(candidateRows, 'candidate');
  if (baselineIds.size !== candidateIds.size
    || [...baselineIds].some((id) => !candidateIds.has(id))) {
    throw new Error('Baseline and candidate must contain the same case id set.');
  }
}

async function loadPolicyText(policyPath) {
  if (!policyPath) return '';
  return readFile(policyPath, 'utf8');
}

async function loadRunner(runnerPath) {
  const runnerUrl = pathToFileURL(path.resolve(runnerPath)).href;
  const runner = await import(runnerUrl);
  if (typeof runner.runCase !== 'function') {
    throw new Error(`Runner must export runCase({ fixture, variant, policyText }): ${runnerPath}`);
  }
  return runner;
}

async function runInjectedRunner(datasetPath, runnerPath, variant, policyPath, injectedRunner, repeats = 1) {
  const sourceFixtures = await readJsonLines(datasetPath);
  const fixtures = sourceFixtures.flatMap((fixture) => Array.from({ length: repeats }, (_, repeat) => ({
    ...fixture,
    id: repeats === 1 ? fixture.id : `${fixture.id ?? 'case'}#r${repeat + 1}`,
  })));
  const runner = injectedRunner ?? await loadRunner(runnerPath);
  const policyText = await loadPolicyText(policyPath);
  const rows = [];
  for (const fixture of fixtures) {
    const generated = await runner.runCase({ fixture, variant, policyText });
    const response = generated && typeof generated === 'object' && !Array.isArray(generated)
      ? generated.response ?? generated.output ?? generated.modelOutput
      : generated;
    rows.push({ ...fixture, response });
  }
  return rows;
}

async function attachPairwiseJudgements({ fixtures, baselineRows, candidateRows, runner }) {
  if (typeof runner.judgePair !== 'function') {
    throw new Error('Real evaluation runner must export judgePair({ fixture, baselineResponse, candidateResponse }).');
  }
  const byId = new Map(fixtures.map((fixture, index) => [String(fixture.id ?? `case-${index + 1}`), fixture]));
  return candidateRows.map(async (candidateRow, index) => {
    const id = String(candidateRow.id ?? `case-${index + 1}`);
    const baselineRow = baselineRows.find((row) => String(row.id ?? '') === id);
    const fixture = byId.get(id) ?? candidateRow;
    const judgement = await runner.judgePair({
      fixture,
      baselineResponse: responseForRow(baselineRow),
      candidateResponse: responseForRow(candidateRow),
    });
    return { ...candidateRow, pairwise: judgement };
  });
}

function stableHash(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

async function readStreakState(statePath) {
  if (!statePath) return { consecutivePasses: 0 };
  try {
    const parsed = JSON.parse(await readFile(path.resolve(statePath), 'utf8'));
    return {
      consecutivePasses: Number.isInteger(parsed?.consecutivePasses) && parsed.consecutivePasses >= 0
        ? parsed.consecutivePasses
        : 0,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { consecutivePasses: 0 };
    throw new Error(`Invalid streak state: ${error.message}`);
  }
}

async function writeStreakState(statePath, state) {
  if (!statePath) return;
  await atomicWrite(path.resolve(statePath), `${JSON.stringify({
    schemaVersion: '1.0',
    consecutivePasses: state.consecutivePasses,
    lastRoundPassed: state.lastRoundPassed,
    lastDecisionPromoted: state.lastDecisionPromoted,
    caseSetHash: state.caseSetHash,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`);
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(?:sk-[a-z0-9_-]{8,}|bearer\s+[a-z0-9._-]{8,})/giu, '[redacted]').slice(0, 1000);
}

function sanitizeObject(value, key = '') {
  if (RAW_TEXT_KEYS.has(key)) return undefined;
  if (typeof value === 'string') return SECRET_PATTERN.test(value) ? '[redacted]' : value;
  if (Array.isArray(value)) return value.map((item) => sanitizeObject(item)).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([entryKey]) => !RAW_TEXT_KEYS.has(entryKey))
    .map(([entryKey, entryValue]) => [entryKey, sanitizeObject(entryValue, entryKey)])
    .filter(([, entryValue]) => entryValue !== undefined));
}

async function assertCandidatePolicy(policyPath) {
  if (!policyPath) throw new Error('--promote requires --candidate-policy <path>.');
  await access(policyPath, fsConstants.R_OK);
  const raw = await readFile(policyPath, 'utf8');
  if (SECRET_PATTERN.test(raw)) throw new Error('Candidate policy contains a secret-like value.');
  let policy;
  try {
    policy = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Candidate policy must be JSON: ${error.message}`);
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('Candidate policy must be a JSON object.');
  }
  return { raw, policy };
}

async function assertCleanGitRoot(targetRoot) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  try {
    const result = await execFileAsync('git', ['-C', targetRoot, 'status', '--porcelain'], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    if (result.stdout.trim()) throw new Error('target-root has uncommitted changes; refusing promotion.');
  } catch (error) {
    if (error.message.includes('uncommitted changes')) throw error;
    throw new Error(`target-root must be a clean git worktree: ${error.message}`);
  }
}

async function atomicWrite(targetPath, content) {
  const directory = path.dirname(targetPath);
  await mkdir(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  await writeFile(tempPath, content, { encoding: 'utf8', flag: 'wx' });
  try {
    await rename(tempPath, targetPath);
  } catch (error) {
    try { await unlink(tempPath); } catch {}
    throw error;
  }
}

async function promotePolicy({ targetRoot, policyPath, summary }) {
  const { raw } = await assertCandidatePolicy(policyPath);
  if (!targetRoot) throw new Error('--promote requires --target-root <main-worktree>.');
  await assertCleanGitRoot(targetRoot);
  const targetPath = path.join(path.resolve(targetRoot), 'config', 'prompt-policy.json');
  const backupPath = `${targetPath}.bak.${Date.now()}`;
  let hadPrevious = false;
  try {
    await access(targetPath, fsConstants.F_OK);
    await rename(targetPath, backupPath);
    hadPrevious = true;
    summary.promotion.backupHash = stableHash(await readFile(backupPath));
    summary.promotion.backupPath = path.relative(targetRoot, backupPath).replaceAll('\\', '/');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await atomicWrite(targetPath, raw.endsWith('\n') ? raw : `${raw}\n`);
  } catch (error) {
    if (hadPrevious) {
      try { await rename(backupPath, targetPath); } catch {}
    }
    throw error;
  }
  summary.promotion.targetPath = path.relative(targetRoot, targetPath).replaceAll('\\', '/');
  summary.promotion.candidatePolicyHash = stableHash(raw);
}

async function main() {
  const { values, flags } = parseArgs(process.argv.slice(2));
  if (flags.has('help')) {
    console.log(usage());
    return;
  }
  const threshold = values.threshold === undefined ? 0.03 : Number(values.threshold);
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('--threshold must be a non-negative ratio.');
  const minRatingDelta = values['min-rating-delta'] === undefined
    ? undefined
    : Number(values['min-rating-delta']);
  if (minRatingDelta !== undefined && (!Number.isFinite(minRatingDelta) || minRatingDelta < 0)) {
    throw new Error('--min-rating-delta must be a non-negative number.');
  }
  const requiredPasses = values['required-passes'] === undefined
    ? (values['streak-state'] ? 2 : 1)
    : Number(values['required-passes']);
  if (!Number.isInteger(requiredPasses) || requiredPasses < 1) {
    throw new Error('--required-passes must be a positive integer.');
  }
  if (requiredPasses > 1 && !values['streak-state']) {
    throw new Error('--required-passes greater than one requires --streak-state.');
  }
  const repeats = values.repeats === undefined ? 1 : Number(values.repeats);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 16) {
    throw new Error('--repeats must be an integer from 1 to 16.');
  }

  let baselineRows;
  let candidateRows;
  let runner;
  let fixtures;
  if (values.runner || values.dataset) {
    if (!values.runner || !values.dataset) throw new Error('--runner and --dataset must be provided together.');
    runner = await loadRunner(values.runner);
    const sourceFixtures = await readJsonLines(values.dataset);
    fixtures = sourceFixtures.flatMap((fixture) => Array.from({ length: repeats }, (_, repeat) => ({
      ...fixture,
      id: repeats === 1 ? fixture.id : `${fixture.id ?? 'case'}#r${repeat + 1}`,
    })));
    baselineRows = await runInjectedRunner(
      values.dataset,
      values.runner,
      'baseline',
      values['baseline-policy'],
      runner,
      repeats,
    );
    candidateRows = await runInjectedRunner(
      values.dataset,
      values.runner,
      'candidate',
      values['candidate-policy'],
      runner,
      repeats,
    );
    candidateRows = await Promise.all(await attachPairwiseJudgements({
      fixtures,
      baselineRows,
      candidateRows,
      runner,
    }));
  } else {
    if (!values.baseline || !values.candidate) throw new Error('--baseline and --candidate are required.');
    baselineRows = await readJsonLines(values.baseline);
    candidateRows = await readJsonLines(values.candidate);
  }
  assertAlignedCases(baselineRows, candidateRows);

  const baselineAggregate = aggregateMetrics(evaluateRows(baselineRows));
  const candidateAggregate = aggregateMetrics(evaluateRows(candidateRows));
  const decision = evaluatePromotion({
    baseline: baselineAggregate,
    candidate: candidateAggregate,
    threshold,
    minRatingDelta,
  });
  const roundPromoted = Boolean(decision.promoted);
  const previousState = await readStreakState(values['streak-state']);
  const consecutivePasses = roundPromoted ? previousState.consecutivePasses + 1 : 0;
  decision.roundPromoted = roundPromoted;
  decision.consecutivePasses = consecutivePasses;
  decision.requiredConsecutivePasses = requiredPasses;
  decision.promoted = roundPromoted && consecutivePasses >= requiredPasses;
  decision.eligibleForPromotion = decision.promoted;
  if (roundPromoted && !decision.promoted) {
    decision.reasons = [...decision.reasons, `consecutive pass streak is ${consecutivePasses}/${requiredPasses}`];
  }
  if (!roundPromoted) {
    decision.reasons = [...decision.reasons, 'current round did not pass the promotion gate'];
  }
  const caseSetHash = stableHash(JSON.stringify({
    baseline: baselineRows,
    candidate: candidateRows,
  }));
  await writeStreakState(values['streak-state'], {
    consecutivePasses,
    lastRoundPassed: roundPromoted,
    lastDecisionPromoted: decision.promoted,
    caseSetHash,
  });
  const summary = createSummary({
    runId: `prompt-eval-${Date.now()}`,
    baseline: baselineAggregate,
    candidate: candidateAggregate,
    decision,
  });
  summary.inputs = {
    baselineCases: baselineRows.length,
    candidateCases: candidateRows.length,
    baselineHash: stableHash(JSON.stringify(baselineRows)),
    candidateHash: stableHash(JSON.stringify(candidateRows)),
    caseSetHash,
    requiredConsecutivePasses: requiredPasses,
    repeats,
  };
  summary.promotion = {
    ...summary.decision,
    mode: flags.has('promote') ? 'promote' : 'dry-run',
  };
  delete summary.decision;

  if (flags.has('promote')) {
    if (!decision.promoted) throw new Error(`Promotion gate rejected candidate: ${decision.reasons.join('; ')}`);
    await promotePolicy({ targetRoot: values['target-root'], policyPath: values['candidate-policy'], summary });
  }

  const safeSummary = sanitizeObject(summary);
  const serialized = `${JSON.stringify(safeSummary, null, 2)}\n`;
  if (values.output) await atomicWrite(path.resolve(values.output), serialized);
  else process.stdout.write(serialized);
  process.stderr.write(`${flags.has('promote') ? 'promoted' : 'dry-run'}: ${decision.promoted ? 'eligible' : 'rejected'}\n`);
}

main().catch((error) => {
  process.stderr.write(`prompt-eval failed: ${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
