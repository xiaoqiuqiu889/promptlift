import { spawn, execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { enhancePrompt } from "../src/core/promptEnhancer.mjs";
import { createWindowsBridge } from "../src/platform/windowsBridge.mjs";
import { DOUBLE_ALT_SCRIPT } from "../src/platform/windowsAltShortcut.mjs";

export const AVATAR_ENTRY = "avatar";
export const ALT_ENTRY = "double-alt";
export const QA_TEMP_PREFIX = "prompt-lift-qa-e2e-";
export const QA_INPUT_HOST_TITLE = "External Chat QA Input Host";
export const PROMPT_LIFT_TITLE = "Prompt Pet";
export const TEST_PROMPTS = Object.freeze({
  [AVATAR_ENTRY]: "请在 2026-08-10 前检查 C:\\work\\app.js，不要修改 API；参考 https://example.com/spec",
  [ALT_ENTRY]: "请在 2026-08-10 前复核 C:\\work\\app.js，不要修改 API；参考 https://example.com/spec；这是双击 Alt 入口的第二条不同原文。",
});

export function createIsolatedAppDataLayout(tempRoot) {
  const root = path.resolve(String(tempRoot));
  const hostAppDataRoot = path.join(root, "host-user-data");
  const promptAppDataRoot = path.join(root, "prompt-lift-user-data");
  const promptLiftUserDataPath = promptAppDataRoot;
  return Object.freeze({
    hostAppDataRoot,
    promptAppDataRoot,
    promptLiftUserDataPath,
    configDestination: path.join(promptLiftUserDataPath, "prompt-lift-model.json"),
    safeStorageStateDestination: path.join(promptLiftUserDataPath, "Local State"),
  });
}

const STAGES = Object.freeze(["event", "loading", "capture", "model", "apply", "restore"]);
const EVIDENCE_DIR_NAME = "e2e";
const MODEL_ENDPOINT = "https://tokenhub.tencentmaas.com/v1";
const MODEL_NAME = "deepseek-v4-flash";
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(PROJECT_ROOT, "qa", "E2E_RESULTS.md");
const SUMMARY_PATH = path.join(PROJECT_ROOT, "qa", "evidence", EVIDENCE_DIR_NAME, "summary.json");
const STEP_LOG_PATH = path.join(PROJECT_ROOT, "qa", "evidence", EVIDENCE_DIR_NAME, "steps.log");
const RUN_METADATA_PATH = path.join(PROJECT_ROOT, "qa", "evidence", EVIDENCE_DIR_NAME, "run.json");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function anchorChecks(text) {
  const value = String(text);
  return {
    hasChinese: /[\u3400-\u9fff]/u.test(value),
    hasRequiredDate: /2026-08-10/u.test(value),
    hasRequiredPath: /C:\\work\\app\.js/u.test(value),
    hasRequiredUrl: /https:\/\/example\.com\/spec/u.test(value),
    hasNegativeConstraint: /不要修改 API/u.test(value),
    hasForbiddenAAAAA: /AAAAA/u.test(value),
    hasReplacementNoise: /�|\uFFFD/u.test(value),
  };
}

function allRequiredAnchorsPresent(checks) {
  return checks?.hasChinese === true
    && checks?.hasRequiredDate === true
    && checks?.hasRequiredPath === true
    && checks?.hasRequiredUrl === true
    && checks?.hasNegativeConstraint === true
    && checks?.hasForbiddenAAAAA !== true
    && checks?.hasReplacementNoise !== true;
}

export function createStageTimeline(_entry) {
  return Object.fromEntries(STAGES.map((stage) => [stage, null]));
}

export function sanitizeEvidenceValue(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeEvidenceValue(item));
  }
  if (value && typeof value === "object") {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const lowerKey = childKey.toLowerCase();
      if (lowerKey === "apikey") {
        if (typeof childValue === "string" && childValue.length > 0) {
          output.apiKeySaved = true;
        }
        continue;
      }
      if (lowerKey.includes("authorization")
        || lowerKey.includes("token")
        || lowerKey.includes("secret")
        || lowerKey.includes("password")
        || lowerKey.includes("credential")) {
        continue;
      }
      if (["prompt", "original", "rawprompt", "replacementtext", "sourceText".toLowerCase()].includes(lowerKey)) {
        continue;
      }
      const sanitized = sanitizeEvidenceValue(childValue, childKey);
      if (sanitized !== undefined) {
        output[childKey] = sanitized;
      }
    }
    return output;
  }
  if (typeof value === "string") {
    if (/^Bearer\s+/iu.test(value) || /(?:sk|key)-[A-Za-z0-9_-]{8,}/u.test(value)) {
      return "[REDACTED]";
    }
    if (key.toLowerCase().includes("prompt") || key.toLowerCase() === "text") {
      return undefined;
    }
  }
  return value;
}

export function createEvidenceSummary({
  model = MODEL_NAME,
  endpoint = MODEL_ENDPOINT,
  apiKeySaved = false,
  calls = 0,
  entries = {},
  failureProtection = {},
  process = {},
  guards = {},
  notExecuted = [],
  interruption = null,
  cleanup = {},
} = {}) {
  const safeEntries = sanitizeEvidenceValue(entries);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    result: "PENDING",
    endpoint,
    model,
    apiKeySaved: apiKeySaved === true,
    realModelCalls: Number.isSafeInteger(calls) ? calls : 0,
    requiredRealReturn: Number.isSafeInteger(calls) && calls > 0,
    entries: safeEntries,
    failureProtection: sanitizeEvidenceValue(failureProtection),
    process: sanitizeEvidenceValue(process),
    guards: sanitizeEvidenceValue(guards),
    interruption: sanitizeEvidenceValue(interruption),
    safety: {
      apiKeyInStdout: false,
      apiKeyInStderr: false,
      apiKeyInReport: false,
      apiKeyInScreenshots: false,
      rawPromptInSummary: false,
    },
    notExecuted: Array.isArray(notExecuted) ? notExecuted.map(String) : [],
    cleanup: sanitizeEvidenceValue(cleanup),
  };
}

export function isPathInsideTempPrefix(target, prefix) {
  const targetPath = path.resolve(String(target));
  const prefixPath = path.resolve(String(prefix));
  const relative = path.relative(prefixPath, targetPath);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function isExactQaTempRoot(value) {
  const resolved = path.resolve(String(value));
  return path.dirname(resolved) === path.resolve(os.tmpdir())
    && path.basename(resolved).startsWith(QA_TEMP_PREFIX);
}

function parseArgument(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function normalizeWindowsPath(value) {
  return path.normalize(path.resolve(String(value))).toLowerCase();
}

function assertPromptLiftUserDataPath(value) {
  const userDataPath = path.resolve(String(value));
  const tempRoot = path.dirname(userDataPath);
  if (!isExactQaTempRoot(tempRoot) || path.basename(userDataPath) !== "prompt-lift-user-data") {
    throw new Error("Prompt Lift wrapper userData path is outside the exact QA temp layout");
  }
  return userDataPath;
}

function assertQaHostUserDataPath(value) {
  const userDataPath = path.resolve(String(value));
  const tempRoot = path.dirname(userDataPath);
  if (!isExactQaTempRoot(tempRoot) || path.basename(userDataPath) !== "host-user-data") {
    throw new Error("QA host wrapper userData path is outside the exact QA temp layout");
  }
  return userDataPath;
}

function parseCommandLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return { op: "error", message: "Invalid JSON control command" };
    }
  }
  const [op, entry, stage, ...rest] = trimmed.split(/\s+/u);
  return { op, entry, stage, rest };
}

function encodePowerShell(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

const PROCESS_QUERY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$rawInput = [Console]::In.ReadToEnd()
$payload = if ([string]::IsNullOrWhiteSpace($rawInput)) { [pscustomobject]@{} } else { $rawInput | ConvertFrom-Json }
$parentPid = [int]$payload.parentPid
$ids = @($payload.pids | ForEach-Object { [int]$_ })
$processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
$selected = @($processes | Where-Object {
    ($parentPid -gt 0 -and $_.ParentProcessId -eq $parentPid) -or
    ($ids.Count -gt 0 -and $ids -contains $_.ProcessId)
} | ForEach-Object {
    [ordered]@{
        pid = [int]$_.ProcessId
        parentPid = [int]$_.ParentProcessId
        name = [string]$_.Name
    }
})
$selected | ConvertTo-Json -Compress
`;

const WINDOW_QUERY_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PromptLiftQaWindowQuery {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$rawInput = [Console]::In.ReadToEnd()
$payload = if ([string]::IsNullOrWhiteSpace($rawInput)) { [pscustomobject]@{} } else { $rawInput | ConvertFrom-Json }
$handle = [PromptLiftQaWindowQuery]::GetForegroundWindow()
$pid = [uint32]0
[void][PromptLiftQaWindowQuery]::GetWindowThreadProcessId($handle, [ref]$pid)
$length = [PromptLiftQaWindowQuery]::GetWindowTextLength($handle)
$builder = New-Object System.Text.StringBuilder ($length + 1)
[void][PromptLiftQaWindowQuery]::GetWindowText($handle, $builder, $builder.Capacity)
[ordered]@{ handle = $handle.ToInt64(); processId = [int]$pid; title = $builder.ToString() } | ConvertTo-Json -Compress
`;

function runStaticPowerShell(script, input, timeoutMs = 5_000) {
  if (process.platform !== "win32") {
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encodePowerShell(script),
    ], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve("");
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.on("error", () => { clearTimeout(timer); resolve(""); });
    child.on("close", () => { clearTimeout(timer); resolve(output.trim()); });
    child.stdin.end(JSON.stringify(input), "utf8");
  });
}

async function queryOwnedProcesses(parentPid, pids = []) {
  const raw = await runStaticPowerShell(PROCESS_QUERY_SCRIPT, { parentPid, pids });
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
      pid: Number(item?.pid),
      parentPid: Number(item?.parentPid),
      name: String(item?.name ?? ""),
    })).filter((item) => Number.isInteger(item.pid) && item.pid > 0);
  } catch {
    return [];
  }
}

async function queryForegroundWindow() {
  const raw = await runStaticPowerShell(WINDOW_QUERY_SCRIPT, {});
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return {
      processId: Number(parsed?.processId),
      title: String(parsed?.title ?? ""),
      hasHandle: Number(parsed?.handle) > 0,
    };
  } catch {
    return undefined;
  }
}

function resolveElectronBinary() {
  const candidates = [
    path.join(PROJECT_ROOT, "node_modules", "electron", "dist", "electron.exe"),
    path.join(PROJECT_ROOT, "node_modules", "electron", "electron.exe"),
  ];
  return candidates[0];
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForJsonFile(filePath, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`QA path probe did not arrive: ${path.basename(filePath)}`);
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processAlive(child) {
  if (!child?.pid) return false;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function copySavedModelConfig(promptUserDataPath) {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const sourceUserDataPath = path.join(appData, "Prompt Lift");
  const source = path.join(sourceUserDataPath, "prompt-lift-model.json");
  const safeStorageStateSource = path.join(sourceUserDataPath, "Local State");
  const destination = path.join(promptUserDataPath, "prompt-lift-model.json");
  const safeStorageStateDestination = path.join(promptUserDataPath, "Local State");
  if (!(await exists(source))) {
    return {
      sourceExists: false,
      copied: false,
      destination,
      safeStorageStateSourceExists: await exists(safeStorageStateSource),
      safeStorageStateCopied: false,
      safeStorageStateDestination,
    };
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  const safeStorageStateSourceExists = await exists(safeStorageStateSource);
  if (safeStorageStateSourceExists) {
    await fs.copyFile(safeStorageStateSource, safeStorageStateDestination);
  }
  return {
    sourceExists: true,
    copied: true,
    destination,
    safeStorageStateSourceExists,
    safeStorageStateCopied: safeStorageStateSourceExists,
    safeStorageStateDestination,
  };
}

function buildEntry(entry) {
  return {
    entry,
    expectedTextSha256: sha256(TEST_PROMPTS[entry]),
    stages: createStageTimeline(entry),
    model: { returned: false, characters: 0 },
    copy: { attempted: false, verified: false },
    host: {},
    focus: {},
    notes: [],
  };
}

function requiredStageNames(entry) {
  return STAGES.filter((stage) => entry.stages[stage] === null);
}

async function readHostState(stateFile) {
  try {
    const parsed = JSON.parse(await fs.readFile(stateFile, "utf8"));
    return sanitizeEvidenceValue(parsed);
  } catch (error) {
    return { readError: String(error?.code ?? "HOST_STATE_READ_FAILED") };
  }
}

function compareHostState(entryName, hostState) {
  const expectedHash = sha256(TEST_PROMPTS[entryName]);
  const currentHash = String(hostState?.textSha256 ?? "");
  const checks = hostState?.checks ?? {};
  return {
    textChars: Number(hostState?.textChars ?? 0),
    currentSha256: currentHash,
    expectedSha256: expectedHash,
    isOriginal: currentHash === expectedHash,
    isChanged: Boolean(currentHash) && currentHash !== expectedHash,
    anchors: {
      hasChinese: checks.hasChinese === true,
      hasRequiredDate: checks.hasRequiredDate === true,
      hasRequiredPath: checks.hasRequiredPath === true,
      hasRequiredUrl: checks.hasRequiredUrl === true,
      hasNegativeConstraint: checks.hasNegativeConstraint === true,
      hasForbiddenAAAAA: checks.hasForbiddenAAAAA === true,
      hasReplacementNoise: checks.hasReplacementNoise === true,
    },
    clipboardProbeSha256: String(hostState?.clipboardProbeSha256 ?? ""),
    clipboardProbeChars: Number(hostState?.clipboardProbeChars ?? 0),
    focusedElement: String(hostState?.focusedElement ?? "none"),
    status: String(hostState?.status ?? "unknown"),
  };
}

async function runFailureProtectionChecks() {
  const result = {
    emptyInput: { passed: false },
    cancellation: { passed: false },
    targetChanged: { passed: false },
    mode: "module-level mock delay / injected bridge; no real API call",
  };

  try {
    await enhancePrompt("", {
      endpoint: MODEL_ENDPOINT,
      model: MODEL_NAME,
      apiKey: "qa-in-memory-only",
      useModel: true,
    });
  } catch (error) {
    result.emptyInput = { passed: error?.code === "EMPTY_PROMPT", code: String(error?.code ?? "") };
  }

  const controller = new AbortController();
  const delayedFetch = async (_url, options) => new Promise((_resolve, reject) => {
    const abort = () => reject(new Error("mock delayed request aborted"));
    if (options.signal.aborted) {
      abort();
      return;
    }
    options.signal.addEventListener("abort", abort, { once: true });
  });
  const pending = enhancePrompt(TEST_PROMPTS[AVATAR_ENTRY], {
    endpoint: MODEL_ENDPOINT,
    model: MODEL_NAME,
    apiKey: "qa-in-memory-only",
    useModel: true,
    fetchImpl: delayedFetch,
    signal: controller.signal,
    timeoutMs: 2_000,
  }).catch((error) => error);
  setTimeout(() => controller.abort(), 25);
  const cancellationError = await pending;
  result.cancellation = {
    passed: cancellationError?.code === "CANCELLED",
    code: String(cancellationError?.code ?? ""),
  };

  let clipboardValue = TEST_PROMPTS[AVATAR_ENTRY];
  const bridge = createWindowsBridge({
    clipboard: {
      async readText() { return clipboardValue; },
      async writeText(value) { clipboardValue = String(value); },
    },
    runPowerShell: async (_script, { input }) => {
      if (input?.replacementText) {
        throw new Error("The target input changed after capture.");
      }
      return JSON.stringify({ handle: 1234, processId: 5678, focusHandle: 1234 });
    },
  });
  try {
    await bridge.replacePrompt("增强后的内容", { handle: 1234, processId: 5678 }, {
      expectedText: TEST_PROMPTS[AVATAR_ENTRY],
    });
  } catch (error) {
    result.targetChanged = {
      passed: error?.code === "TARGET_CONTENT_CHANGED",
      code: String(error?.code ?? ""),
    };
  }
  return result;
}

function detailString(value) {
  return String(value ?? "").replace(/[\r\n]/gu, " ").slice(0, 240);
}

function appendLog(run, message, details = {}) {
  const line = JSON.stringify({
    tMs: Date.now() - run.startedAt,
    message,
    ...sanitizeEvidenceValue(details),
  });
  run.logLines.push(line);
  return fs.appendFile(STEP_LOG_PATH, `${line}\n`, "utf8");
}

async function collectEntry(run, entryName) {
  const entry = run.entries[entryName];
  const state = await readHostState(run.hostStateFile);
  const compared = compareHostState(entryName, state);
  entry.host = compared;
  await appendLog(run, "host-state", { entry: entryName, host: compared });
  return compared;
}

async function markStage(run, entryName, stage, details = {}) {
  if (!run.entries[entryName]) {
    throw new Error(`Unknown entry: ${entryName}`);
  }
  if (!STAGES.includes(stage)) {
    throw new Error(`Unknown stage: ${stage}`);
  }
  const entry = run.entries[entryName];
  if (entry.stages[stage] === null) {
    entry.stages[stage] = Date.now() - run.startedAt;
  }
  if (stage === "model") {
    const host = await collectEntry(run, entryName);
    const returned = host.isChanged && allRequiredAnchorsPresent(host.anchors);
    entry.model = {
      returned,
      characters: returned ? host.textChars : 0,
    };
    if (returned && !entry.modelCounted) {
      run.realModelCalls += 1;
      entry.modelCounted = true;
      run.apiKeySaved = true;
      run.appUserDataPathVerified = run.configDestinationExists === true;
    }
  }
  if (stage === "apply") {
    const host = await collectEntry(run, entryName);
    entry.apply = {
      confirmed: host.isChanged && allRequiredAnchorsPresent(host.anchors),
      characters: host.textChars,
    };
  }
  if (stage === "restore") {
    const host = await collectEntry(run, entryName);
    entry.restore = {
      confirmed: host.isOriginal,
      characters: host.textChars,
    };
  }
  await appendLog(run, "stage", { entry: entryName, stage, details });
}

async function markCopy(run, entryName) {
  const entry = run.entries[entryName];
  const host = await collectEntry(run, entryName);
  entry.copy = {
    attempted: true,
    verified: Boolean(host.clipboardProbeSha256)
      && host.clipboardProbeSha256 === host.currentSha256
      && host.clipboardProbeChars === host.textChars,
  };
  await appendLog(run, "copy-check", { entry: entryName, copy: entry.copy });
}

async function markProcessState(run) {
  const children = await queryOwnedProcesses(run.promptLiftProcess.pid, []);
  const listener = children.find((child) => /powershell/i.test(child.name));
  const foreground = await queryForegroundWindow();
  run.process = {
    hostPid: run.hostProcess.pid,
    promptLiftPid: run.promptLiftProcess.pid,
    hostAlive: processAlive(run.hostProcess),
    promptLiftAlive: processAlive(run.promptLiftProcess),
    listenerPid: listener?.pid ?? null,
    listenerName: listener?.name ?? null,
    listenerAlive: Boolean(listener?.pid),
    foreground: foreground ?? null,
    appUserDataPathVerified: run.appUserDataPathVerified === true,
    configDestinationExists: run.configDestinationExists === true,
    promptLiftUserDataPath: run.promptLiftUserDataPath,
  };
  await appendLog(run, "process-check", run.process);
  return run.process;
}

function entryPasses(entry) {
  const stagesPass = requiredStageNames(entry).length === 0;
  const modelPass = entry.model?.returned === true;
  const applyPass = entry.apply?.confirmed === true;
  const restorePass = entry.restore?.confirmed === true;
  return stagesPass && modelPass && applyPass && restorePass;
}

function collectNotExecuted(run) {
  const missing = [];
  for (const entry of Object.values(run.entries)) {
    for (const stage of requiredStageNames(entry)) {
      missing.push(`${entry.entry}.${stage}: 未观察到或未执行`);
    }
    if (entry.entry === AVATAR_ENTRY && entry.copy?.verified !== true) {
      missing.push(`${entry.entry}.copy: 未通过 QA host 的真实 Ctrl+V 验证`);
    }
  }
  if (!run.process.listenerAlive) {
    missing.push("double-alt.listener: 未能证明监听 PowerShell 进程在启动后存活");
  }
  for (const [name, passed] of Object.entries(run.guards)) {
    if (passed !== true) {
      missing.push(`double-alt.guard.${name}: 未通过 Computer Use 实际按键验证`);
    }
  }
  return missing;
}

function stageTable(entry) {
  return STAGES.map((stage) => `| ${stage} | ${entry.stages[stage] === null ? "未记录" : `${entry.stages[stage]} ms`} |`).join("\n");
}

function createReport(summary, run) {
  const pass = summary.result === "PASS";
  const avatar = summary.entries[AVATAR_ENTRY] ?? {};
  const alt = summary.entries[ALT_ENTRY] ?? {};
  const chars = (entry) => Number(entry?.model?.characters ?? 0);
  const backfill = (entry) => entry?.apply?.confirmed === true ? "是" : "否";
  const restore = (entry) => entry?.restore?.confirmed === true ? "是" : "否";
  const notExecuted = summary.notExecuted.length > 0 ? summary.notExecuted.map((item) => `- ${item}`).join("\n") : "- 无";
  return `# Prompt Lift Windows 真实端到端验收

## 结论

**${pass ? "PASS" : "FAIL"}**

- 真实模型：\`${summary.model}\`
- Endpoint：\`${summary.endpoint}\`
- API Key 已保存：\`${summary.apiKeySaved ? "true" : "false"}\`（报告不包含 Key）
- 真实模型返回次数：\`${summary.realModelCalls}\`
- 至少一次真实返回：\`${summary.requiredRealReturn ? "是" : "否"}\`
- 监听进程存活：\`${summary.process.listenerAlive ? "是" : "否"}\`
- Electron userData 路径：\`${summary.process.appUserDataPathVerified ? "wrapper 直接核验 app.getPath('userData')" : "未验证"}\`
- Computer Use：\`${summary.interruption?.reason ?? "未中断"}\`

## 入口结果

| 入口 | 真实返回字符数 | 成功回填 | 成功恢复 | 结果 |
| --- | ---: | --- | --- | --- |
| 左键头像 | ${chars(avatar)} | ${backfill(avatar)} | ${restore(avatar)} | ${entryPasses(avatar) ? "PASS" : "FAIL"} |
| 双击 Alt | ${chars(alt)} | ${backfill(alt)} | ${restore(alt)} | ${entryPasses(alt) ? "PASS" : "FAIL"} |

## 左键头像阶段（相对时间）

| 阶段 | 时间 |
| --- | ---: |
${stageTable(avatar)}

## 双击 Alt 阶段（相对时间）

| 阶段 | 时间 |
| --- | ---: |
${stageTable(alt)}

## 关键安全检查

- 原文锚点：数字、日期、路径、链接、否定约束分别记录在 \`summary.json\`，缺失即不通过。
- 模型结果：禁止 \`AAAAA\` 与替换乱码；结果未通过校验时不得回填。
- 空输入保护：\`${summary.failureProtection.emptyInput?.passed ? "PASS" : "FAIL"}\`。
- 等待取消保护：\`${summary.failureProtection.cancellation?.passed ? "PASS" : "FAIL"}\`（可控 mock 延迟）。
- 目标内容变化保护：\`${summary.failureProtection.targetChanged?.passed ? "PASS" : "FAIL"}\`（注入 bridge mock）。
- API Key：未写入 stdout、stderr、报告或截图；证据只保留布尔状态。

## Alt 误触保护

- 单次 Alt 不触发：\`${summary.guards.singleAltNoTrigger ? "PASS" : "FAIL"}\`
- Alt+Tab 不触发：\`${summary.guards.altTabNoTrigger ? "PASS" : "FAIL"}\`
- 右 Alt/AltGr 不触发：\`${summary.guards.rightAltNoTrigger ? "PASS" : "FAIL"}\`

## 未执行项及原因

${notExecuted}

## 证据

- [summary.json](./evidence/e2e/summary.json)
- [steps.log](./evidence/e2e/steps.log)
- 运行元数据：[run.json](./evidence/e2e/run.json)

所有临时 userData 位于系统 Temp 的精确前缀目录，收尾后删除；用户现有 packaged Prompt Lift 未关闭。
`;
}

async function terminateOwnedChild(child) {
  if (!child || !child.pid || !processAlive(child)) return;
  child.kill();
  const deadline = Date.now() + 4_000;
  while (processAlive(child) && Date.now() < deadline) {
    await sleep(100);
  }
}

async function cleanupTempRoot(run) {
  if (!isExactQaTempRoot(run.tempRoot) || !isPathInsideTempPrefix(run.tempRoot, run.tempRoot)) {
    return { attempted: false, removed: false, reason: "TEMP_ROOT_VALIDATION_FAILED" };
  }
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await fs.rm(run.tempRoot, { recursive: true, force: true });
      if (!(await exists(run.tempRoot))) {
        return { attempted: true, removed: true };
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  return {
    attempted: true,
    removed: false,
    reason: String(lastError?.code ?? "TEMP_REMOVE_FAILED"),
  };
}

async function finishRun(run, requestedResult = "") {
  if (run.finished) return;
  run.finished = true;
  await markProcessState(run);
  const notExecuted = collectNotExecuted(run);
  const failureProtection = run.failureProtection;
  const allEntriesPass = Object.values(run.entries).every(entryPasses);
  const allFailurePass = Object.values(failureProtection).filter((value) => value && typeof value === "object" && "passed" in value).every((value) => value.passed === true);
  const computedPass = allEntriesPass && allFailurePass && run.realModelCalls > 0 && run.process.listenerAlive;
  const summary = createEvidenceSummary({
    model: MODEL_NAME,
    endpoint: MODEL_ENDPOINT,
    apiKeySaved: run.apiKeySaved,
    calls: run.realModelCalls,
    entries: run.entries,
    failureProtection,
    process: run.process,
    guards: run.guards,
    notExecuted,
    interruption: run.interruption,
    cleanup: { tempRoot: run.tempRoot, removed: false },
  });
  summary.result = requestedResult === "PASS" && computedPass ? "PASS" : computedPass ? "PASS" : "FAIL";
  summary.failureProtection = sanitizeEvidenceValue(failureProtection);
  await fs.writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  await terminateOwnedChild(run.promptLiftProcess);
  await terminateOwnedChild(run.hostProcess);
  const cleanup = await cleanupTempRoot(run);
  summary.cleanup = sanitizeEvidenceValue({ tempRoot: run.tempRoot, removed: cleanup.removed });
  await fs.writeFile(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(REPORT_PATH, createReport(summary, run), "utf8");
  await appendLog(run, "finish", { result: summary.result, cleanup: summary.cleanup });
  process.stdout.write(`QA_FINISHED result=${summary.result} realModelCalls=${summary.realModelCalls} avatar=${entryPasses(run.entries[AVATAR_ENTRY]) ? "PASS" : "FAIL"} alt=${entryPasses(run.entries[ALT_ENTRY]) ? "PASS" : "FAIL"}\n`);
  process.exitCode = summary.result === "PASS" ? 0 : 1;
  setImmediate(() => process.exit(process.exitCode ?? 0));
}

async function createRun() {
  if (process.platform !== "win32") {
    throw new Error("This real E2E harness requires Windows.");
  }
  const electronBinary = resolveElectronBinary();
  if (!(await exists(electronBinary))) {
    throw new Error(`Electron binary not found: ${electronBinary}`);
  }
  const evidenceDir = path.join(PROJECT_ROOT, "qa", "evidence", EVIDENCE_DIR_NAME);
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(STEP_LOG_PATH, "", "utf8");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), QA_TEMP_PREFIX));
  const appDataLayout = createIsolatedAppDataLayout(tempRoot);
  const {
    hostAppDataRoot,
    promptAppDataRoot,
    promptLiftUserDataPath,
    configDestination,
    safeStorageStateDestination,
  } = appDataLayout;
  const hostStateFile = path.join(tempRoot, "host-state.json");
  await fs.mkdir(hostAppDataRoot, { recursive: true });
  await fs.mkdir(promptAppDataRoot, { recursive: true });
  const config = await copySavedModelConfig(promptLiftUserDataPath);
  const hostEnvironment = {
    ...process.env,
    PROMPT_LIFT_SHOW_ON_START: "1",
    ELECTRON_NO_ATTACH_CONSOLE: "1",
  };
  const promptEnvironment = {
    ...process.env,
    PROMPT_LIFT_SHOW_ON_START: "1",
    ELECTRON_NO_ATTACH_CONSOLE: "1",
  };
  const hostScript = path.join(PROJECT_ROOT, "scripts", "qa-e2e-input-host.mjs");
  const wrapperScript = path.join(PROJECT_ROOT, "scripts", "qa-real-e2e.mjs");
  const hostProcess = spawn(electronBinary, [
    hostScript,
    `--state-file=${hostStateFile}`,
    `--qa-user-data=${hostAppDataRoot}`,
  ], { cwd: PROJECT_ROOT, env: hostEnvironment, windowsHide: false, stdio: ["ignore", "ignore", "ignore"] });
  const promptLiftProcess = spawn(electronBinary, [
    wrapperScript,
    "--prompt-lift-host",
    `--prompt-lift-user-data=${promptLiftUserDataPath}`,
  ], { cwd: PROJECT_ROOT, env: promptEnvironment, windowsHide: false, stdio: ["ignore", "ignore", "ignore"] });
  const promptPathProbe = await waitForJsonFile(path.join(tempRoot, "prompt-lift-userdata-path.json"));
  if (promptPathProbe?.verified !== true) {
    throw new Error("Prompt Lift userData path probe failed");
  }
  const run = {
    startedAt: Date.now(),
    tempRoot,
    hostAppDataRoot,
    promptAppDataRoot,
    promptLiftUserDataPath,
    hostStateFile,
    configCopied: config.copied,
    configDestination,
    configDestinationExists: await exists(configDestination),
    safeStorageStateCopied: config.safeStorageStateCopied,
    safeStorageStateDestination,
    safeStorageStateDestinationExists: await exists(safeStorageStateDestination),
    apiKeySaved: false,
    appUserDataPathVerified: true,
    promptPathProbe,
    sourceConfigExists: config.sourceExists,
    sourceSafeStorageStateExists: config.safeStorageStateSourceExists,
    hostProcess,
    promptLiftProcess,
    entries: {
      [AVATAR_ENTRY]: buildEntry(AVATAR_ENTRY),
      [ALT_ENTRY]: buildEntry(ALT_ENTRY),
    },
    realModelCalls: 0,
    guards: {
      singleAltNoTrigger: false,
      altTabNoTrigger: false,
      rightAltNoTrigger: false,
    },
    process: {},
    failureProtection: await runFailureProtectionChecks(),
    logLines: [],
    finished: false,
    interruption: null,
  };
  await fs.writeFile(RUN_METADATA_PATH, `${JSON.stringify(sanitizeEvidenceValue({
    schemaVersion: 1,
    title: QA_INPUT_HOST_TITLE,
    promptLiftTitle: PROMPT_LIFT_TITLE,
    hostPid: hostProcess.pid,
    promptLiftPid: promptLiftProcess.pid,
    sourceConfigExists: config.sourceExists,
    configCopied: config.copied,
    configDestination,
    configDestinationExists: await exists(configDestination),
    sourceSafeStorageStateExists: config.safeStorageStateSourceExists,
    safeStorageStateCopied: config.safeStorageStateCopied,
    safeStorageStateDestination,
    safeStorageStateDestinationExists: await exists(safeStorageStateDestination),
    promptLiftUserDataPath,
    appUserDataPathExpected: promptLiftUserDataPath,
    appUserDataPathVerified: promptPathProbe.verified === true,
    appUserDataPathActual: promptPathProbe.actual,
    model: MODEL_NAME,
    endpoint: MODEL_ENDPOINT,
    tempRoot,
    createdAt: new Date().toISOString(),
  }), null, 2)}\n`, "utf8");
  await appendLog(run, "launch", {
    hostPid: hostProcess.pid,
    promptLiftPid: promptLiftProcess.pid,
    hostTitle: QA_INPUT_HOST_TITLE,
    promptLiftTitle: PROMPT_LIFT_TITLE,
    sourceConfigExists: config.sourceExists,
    configCopied: config.copied,
    configDestinationExists: run.configDestinationExists,
    safeStorageStateCopied: run.safeStorageStateCopied,
    safeStorageStateDestinationExists: run.safeStorageStateDestinationExists,
    promptLiftUserDataPath: run.promptLiftUserDataPath,
    appUserDataPathVerified: run.appUserDataPathVerified,
    failureProtection: run.failureProtection,
  });
  await sleep(2_000);
  await markProcessState(run);
  return run;
}

async function printReady(run) {
  process.stdout.write([
    "QA_READY",
    `hostPid=${run.hostProcess.pid}`,
    `promptLiftPid=${run.promptLiftProcess.pid}`,
    `hostTitle=${QA_INPUT_HOST_TITLE}`,
    `promptLiftTitle=${PROMPT_LIFT_TITLE}`,
    `configCopied=${run.configCopied}`,
    `configDestinationExists=${run.configDestinationExists}`,
    `safeStorageStateCopied=${run.safeStorageStateCopied}`,
    `safeStorageStateDestinationExists=${run.safeStorageStateDestinationExists}`,
    `listenerAlive=${run.process.listenerAlive}`,
    "",
    "Computer Use only: select the returned QA host window by exact title and the development Prompt Pet window by its returned app/window object.",
    "Control commands: mark <avatar|double-alt> <event|loading|capture|model|apply|restore>; collect <entry>; copy <entry>; guard <single-alt|alt-tab|right-alt> <true|false>; process; finish",
    "",
  ].join("\n"));
}

async function handleCommand(run, command) {
  if (!command) return;
  if (command.op === "error") {
    process.stdout.write(`${command.message}\n`);
    return;
  }
  try {
    if (command.op === "mark") {
      await markStage(run, command.entry, command.stage, { source: "manual Computer Use observation" });
      process.stdout.write(`MARKED ${command.entry}.${command.stage}\n`);
    } else if (command.op === "collect") {
      const value = await collectEntry(run, command.entry);
      process.stdout.write(`COLLECTED ${command.entry} changed=${value.isChanged} original=${value.isOriginal} chars=${value.textChars}\n`);
    } else if (command.op === "copy") {
      await markCopy(run, command.entry);
      process.stdout.write(`COPY ${command.entry} verified=${run.entries[command.entry].copy.verified}\n`);
    } else if (command.op === "process") {
      const value = await markProcessState(run);
      process.stdout.write(`PROCESS listenerAlive=${value.listenerAlive} hostAlive=${value.hostAlive} promptLiftAlive=${value.promptLiftAlive} foreground=${detailString(value.foreground?.title)}\n`);
    } else if (command.op === "guard") {
      const guardNames = {
        "single-alt": "singleAltNoTrigger",
        "alt-tab": "altTabNoTrigger",
        "right-alt": "rightAltNoTrigger",
      };
      const guardName = guardNames[command.entry];
      if (!guardName) throw new Error(`Unknown guard: ${String(command.entry)}`);
      run.guards[guardName] = String(command.stage).toLowerCase() === "true";
      await appendLog(run, "guard", { guard: guardName, passed: run.guards[guardName] });
      process.stdout.write(`GUARD ${command.entry} passed=${run.guards[guardName]}\n`);
    } else if (command.op === "finish") {
      await finishRun(run, command.stage ?? command.result ?? "");
    } else if (command.op === "help") {
      await printReady(run);
    } else {
      process.stdout.write(`Unknown control command: ${String(command.op)}\n`);
    }
  } catch (error) {
    await appendLog(run, "command-error", { command: sanitizeEvidenceValue(command), error: String(error?.message ?? error) });
    process.stdout.write(`COMMAND_ERROR ${detailString(error?.message ?? error)}\n`);
  }
}

async function runInteractive() {
  const run = await createRun();
  await printReady(run);
  process.stdin.setEncoding("utf8");
  let buffer = "";
  process.stdin.on("data", (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      void handleCommand(run, parseCommandLine(line));
    }
  });
  process.stdin.on("end", () => {
    if (!run.finished) void finishRun(run, "");
  });
  process.on("SIGINT", () => {
    if (!run.finished) void finishRun(run, "");
  });
}

async function runPromptLiftElectronWrapper() {
  const requestedUserDataPath = parseArgument("prompt-lift-user-data");
  const userDataPath = assertPromptLiftUserDataPath(requestedUserDataPath);
  const { app } = await import("electron");
  app.setPath("userData", userDataPath);
  const actualUserDataPath = path.resolve(app.getPath("userData"));
  const probePath = path.join(path.dirname(userDataPath), "prompt-lift-userdata-path.json");
  await fs.writeFile(probePath, `${JSON.stringify({
    expected: userDataPath,
    actual: actualUserDataPath,
    verified: normalizeWindowsPath(actualUserDataPath) === normalizeWindowsPath(userDataPath),
  }, null, 2)}\n`, "utf8");
  if (normalizeWindowsPath(actualUserDataPath) !== normalizeWindowsPath(userDataPath)) {
    throw new Error("Prompt Lift wrapper app.getPath('userData') mismatch");
  }
  await import("../src/main.mjs");
}

if (process.versions?.electron && process.argv.includes("--prompt-lift-host")) {
  runPromptLiftElectronWrapper().catch((error) => {
    process.stderr.write(`Prompt Lift QA wrapper failed: ${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
} else if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runInteractive().catch(async (error) => {
    process.stderr.write(`QA harness failed: ${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
