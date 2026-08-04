# Prompt evaluation and controlled promotion

This branch adds a privacy-preserving Champion/Challenger loop for Prompt Lift. It evaluates model responses without persisting source text, model output, API keys, or authorization headers.

## What is measured

The deterministic gate in `scripts/prompt-eval/metrics.mjs` checks:

- exact JSON protocol, mode, language, status, and field set;
- `ok`, `unchanged`, and `needs_input` semantics;
- a hard three-times source-length ceiling for every tier;
- URLs, paths, issue IDs, e-mail addresses, flags, code, and template anchors;
- introduced platform, audience, workflow, deliverable, capability, and solution categories;
- negative constraints and soft/hard modality drift.

Each case produces a privacy-safe report. Optional independent judge values can be supplied as scalar fields under `semantic` and `task`. The quality score combines hard compliance (60%), semantic fidelity (25%), and task utility (15%). A judge never overrides a hard-gate failure.

## Offline comparison

Each JSONL row must contain an `id`, `sourceText`, and a protocol response in `response` (or `modelOutput`/`output`). Baseline and candidate files must contain exactly the same case-id set.

```powershell
node scripts/prompt-eval.mjs `
  --baseline .\qa\prompt-eval\baseline.jsonl `
  --candidate .\qa\prompt-eval\candidate.jsonl `
  --output .\qa\prompt-eval\summary.json
```

The default is dry-run. The summary contains aggregate counts, rates, hashes, and the promotion decision only. It does not contain source or result text.

The default promotion threshold is a **3% relative improvement** in the quality score:

```text
(candidateQuality - baselineQuality) / baselineQuality >= 0.03
```

The candidate is rejected if any of these regress:

- hard-gate pass rate;
- semantic fidelity or anchor recall;
- task utility;
- scope invention rate;
- repair rate or length-violation rate.

## Connecting a real model

The runner is injected so the evaluation process does not own credentials or production orchestration. An ESM runner exports:

```js
export async function runCase({ fixture, variant, policyText }) {
  // Call the configured model here. Never log fixture.sourceText or the raw output.
  return { response: JSON.stringify({
    protocol: '2.0',
    mode: fixture.mode,
    language: fixture.language,
    status: 'ok',
    result: '...',
  }) };
}
```

Run both variants over a fixture set:

```powershell
node scripts/prompt-eval.mjs `
  --dataset .\qa\prompt-eval\golden.jsonl `
  --runner .\qa\prompt-eval\runner.mjs `
  --baseline-policy .\config\prompt-policy.json `
  --candidate-policy .\qa\prompt-eval\candidate-policy.json `
  --output .\qa\prompt-eval\summary.json
```

The runner must return one result per fixture. The CLI compares the same fixture IDs and rejects mismatched sets.

The repository includes a real OpenAI-compatible TokenHub runner at
`qa/prompt-eval/tokenhub-runner.mjs`. It reuses Prompt Lift's production
`buildModelMessages` contract, sends `thinking: { "type": "disabled" }` for
DeepSeek V4, and reads credentials only from process environment variables:

```powershell
$env:TOKENHUB_API_KEY = '<provided out of band>'
$env:TOKENHUB_BASE_URL = 'https://tokenhub.tencentmaas.com/v1'
$env:TOKENHUB_MODEL = 'deepseek-v4-flash'
node scripts/prompt-eval.mjs `
  --dataset .\qa\prompt-eval\golden.jsonl `
  --runner .\qa\prompt-eval\tokenhub-runner.mjs `
  --baseline-policy .\config\prompt-policy.json `
  --candidate-policy .\qa\prompt-eval\candidate-policy.json `
  --output .\qa\prompt-eval\summary.json
Remove-Item Env:TOKENHUB_API_KEY, Env:TOKENHUB_BASE_URL, Env:TOKENHUB_MODEL
```

The key must never be committed, passed as a command-line argument, or written
to the summary. If the real runner fails, the result is reported as a failed
evaluation; the mock runner is only for offline contract tests and cannot
produce a production conclusion.

## Controlled write-back

Writing a candidate policy is an explicit operation:

```powershell
node scripts/prompt-eval.mjs `
  --baseline .\qa\prompt-eval\baseline.jsonl `
  --candidate .\qa\prompt-eval\candidate.jsonl `
  --candidate-policy .\qa\prompt-eval\candidate-policy.json `
  --target-root C:\path\to\clean\main-worktree `
  --promote
```

Promotion requires:

1. the 3% relative quality improvement;
2. no hard or protected-quality regression;
3. a readable candidate policy with no secret-like value;
4. a clean Git worktree at `--target-root`.

The policy is written atomically to `config/prompt-policy.json`. An existing policy is renamed to a timestamped `.bak` before replacement. The command does not commit, push, merge, or modify a dirty worktree. Review and commit the resulting mainline change separately.

The runtime prompt builder reads `config/prompt-policy.json` and inserts only bounded, sanitized `constraints.global`, `constraints.modes`, and `constraints.tiers` lines. An empty policy is a no-op, so the evaluation harness can be deployed before the first promoted constraint.

## Iteration discipline

Use the following release rule:

```text
candidate passes all hard gates
AND quality score improves by at least 3% relative
AND no protected metric regresses
→ policy may be promoted
```

After each promotion, retain the privacy-safe summary and add any newly discovered failure category to the versioned fixture set. Do not let a model alter its own production policy without this offline comparison and explicit promotion flag.

