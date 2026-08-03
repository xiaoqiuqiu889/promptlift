import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const QA_INPUT_HOST_TITLE = "External Chat QA Input Host";

const QA_STATE_SCHEMA_VERSION = 1;
const REQUIRED_ANCHORS = Object.freeze({
  chinese: /[\u3400-\u9fff]/u,
  date: /2026-08-10/u,
  path: /C:\\work\\app\.js/u,
  url: /https:\/\/example\.com\/spec/u,
  negative: /不要修改 API/u,
});

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function getTextChecks(text) {
  const value = String(text);
  return {
    hasChinese: REQUIRED_ANCHORS.chinese.test(value),
    hasRequiredDate: REQUIRED_ANCHORS.date.test(value),
    hasRequiredPath: REQUIRED_ANCHORS.path.test(value),
    hasRequiredUrl: REQUIRED_ANCHORS.url.test(value),
    hasNegativeConstraint: REQUIRED_ANCHORS.negative.test(value),
    hasForbiddenAAAAA: /AAAAA/u.test(value),
    hasReplacementNoise: /�|\uFFFD/u.test(value),
  };
}

export function createInitialQaHostState(text = "") {
  const value = String(text);
  return {
    schemaVersion: QA_STATE_SCHEMA_VERSION,
    title: QA_INPUT_HOST_TITLE,
    text: value,
    textChars: value.length,
    textSha256: sha256(value),
    checks: getTextChecks(value),
    clipboardProbeSha256: "",
    clipboardProbeChars: 0,
    status: value ? "ready" : "empty",
    focusedElement: "none",
    sensitive: false,
    exportedAt: null,
  };
}

export function buildQaInputHostHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${QA_INPUT_HOST_TITLE}</title>
    <style>
      :root { color-scheme: dark; font-family: "Segoe UI", "Noto Sans SC", sans-serif; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; background: #10151d; color: #ecf3ff; }
      body { padding: 24px; overflow: auto; }
      main { max-width: 940px; margin: 0 auto; }
      h1 { margin: 0 0 4px; font-size: 22px; }
      .subtitle { margin: 0 0 18px; color: #aab9d3; font-size: 13px; }
      .grid { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr) minmax(260px, 0.62fr); }
      .panel { padding: 15px; border: 1px solid #31435e; border-radius: 12px; background: #171f2d; }
      label { display: block; margin-bottom: 7px; color: #c1cfea; font-size: 12px; font-weight: 700; }
      textarea, [contenteditable="true"] { width: 100%; min-height: 174px; padding: 12px; border: 1px solid #4b6386; border-radius: 8px; outline: none; color: #f1f5ff; background: #0d131d; font: 14px/1.6 Consolas, "Noto Sans SC", monospace; resize: vertical; }
      textarea:focus, [contenteditable="true"]:focus { border-color: #77a9ff; box-shadow: 0 0 0 2px #29528b; }
      #clipboardProbe { min-height: 78px; }
      #qaContentEditable { min-height: 52px; color: #a9b9d2; font-size: 12px; }
      #validationState { min-height: 248px; color: #bdebd1; font-size: 12px; }
      .hint { margin: 8px 0 0; color: #8ea1bd; font-size: 11px; line-height: 1.45; }
      .status-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
      #focusState { color: #83e8c5; font-size: 12px; }
      button { padding: 8px 12px; border: 1px solid #5678aa; border-radius: 8px; color: #f2f7ff; background: #244d86; cursor: pointer; }
      button:hover { background: #2f66ab; }
      .footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; }
      .badge { padding: 4px 8px; border-radius: 999px; color: #09140f; background: #83e8c5; font-size: 11px; font-weight: 800; }
      @media (max-width: 760px) { body { padding: 14px; } .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <h1>${QA_INPUT_HOST_TITLE}</h1>
      <p class="subtitle">隔离真实输入目标：Prompt Lift 只会读取并回填下面的原生 textarea。</p>
      <div class="status-line"><span id="focusState">当前焦点：无</span><span class="badge">QA ONLY</span></div>
      <div class="grid">
        <section class="panel">
          <label for="qaInput">原文输入区（真实目标 textarea）</label>
          <textarea id="qaInput" aria-label="QA original prompt input" spellcheck="false" autocomplete="off"></textarea>
          <p class="hint">先点击这里并输入测试原文。内容变化会自动更新右侧的脱敏验证状态。</p>
          <label for="clipboardProbe" style="margin-top: 16px">复制验证区（复制后在此粘贴）</label>
          <textarea id="clipboardProbe" aria-label="QA clipboard verification input" spellcheck="false" autocomplete="off"></textarea>
          <p class="hint">此区域只用于通过真实 Ctrl+V 验证 Prompt Lift 的复制按钮。</p>
          <label for="qaContentEditable" style="margin-top: 16px">备用 contenteditable（不作为本次目标）</label>
          <div id="qaContentEditable" contenteditable="true" aria-label="QA contenteditable mirror">备用 contenteditable surface</div>
        </section>
        <section class="panel">
          <label for="validationState">可导出的脱敏验证状态（只读）</label>
          <textarea id="validationState" readonly aria-label="QA validation state"></textarea>
          <div class="footer"><span class="hint">不保存原文，不保存 API Key，只写哈希、长度和锚点检查。</span><button id="exportState" type="button">导出验证状态</button></div>
        </section>
      </div>
    </main>
    <script>
      const input = document.querySelector("#qaInput");
      const probe = document.querySelector("#clipboardProbe");
      const stateView = document.querySelector("#validationState");
      const focusState = document.querySelector("#focusState");
      const exportButton = document.querySelector("#exportState");
      let lastState = {};

      function renderState(state) {
        lastState = state || {};
        stateView.value = JSON.stringify(lastState, null, 2);
      }

      function syncInput() {
        window.qaHost.updateInput(input.value);
      }

      function syncProbe() {
        window.qaHost.updateClipboardProbe(probe.value);
      }

      input.addEventListener("input", syncInput);
      probe.addEventListener("input", syncProbe);
      input.addEventListener("focus", () => { focusState.textContent = "当前焦点：原文输入区"; window.qaHost.updateFocus("qaInput"); });
      input.addEventListener("blur", () => { focusState.textContent = "当前焦点：无"; window.qaHost.updateFocus("none"); });
      probe.addEventListener("focus", () => { focusState.textContent = "当前焦点：复制验证区"; window.qaHost.updateFocus("clipboardProbe"); });
      probe.addEventListener("blur", () => { focusState.textContent = "当前焦点：无"; window.qaHost.updateFocus("none"); });
      exportButton.addEventListener("click", () => { window.qaHost.exportState(); });
      window.qaHost.onState(renderState);
      window.qaHost.requestState();
    </script>
  </body>
</html>`;
}

function parseArgument(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function validateExplicitUserDataPath(value) {
  const resolved = path.resolve(String(value));
  const tempRoot = path.dirname(resolved);
  if (path.basename(resolved) !== "host-user-data"
    || path.dirname(tempRoot) !== path.resolve(os.tmpdir())
    || !path.basename(tempRoot).startsWith("prompt-lift-qa-e2e-")) {
    throw new Error("QA host userData path is outside the exact QA temp layout");
  }
  return resolved;
}

function publicState(state) {
  const { text: _text, ...safeState } = state;
  return safeState;
}

async function runQaHost({ app, BrowserWindow, ipcMain }) {
  const stateFile = path.resolve(parseArgument("state-file", path.join(os.tmpdir(), "prompt-lift-qa-host-state.json")));
  const initialText = parseArgument("initial-text", "");
  const userDataPath = app.getPath("userData");
  const appDataPath = app.getPath("appData");
  const appDataEnv = String(process.env.APPDATA ?? "");
  await fs.mkdir(path.dirname(stateFile), { recursive: true });

  let state = createInitialQaHostState(initialText);
  let mainWindow;

  async function writeState() {
    const output = {
      ...publicState(state),
      pid: process.pid,
      appDataPath,
      appDataEnv,
      userDataPath,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(stateFile, JSON.stringify(output, null, 2), "utf8");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("qa-host:state", output);
    }
  }

  function updateText(text) {
    state.text = String(text);
    state.textChars = state.text.length;
    state.textSha256 = sha256(state.text);
    state.checks = getTextChecks(state.text);
    state.status = state.text ? "changed" : "empty";
    void writeState();
  }

  function updateClipboardProbe(text) {
    const value = String(text);
    state.clipboardProbeSha256 = sha256(value);
    state.clipboardProbeChars = value.length;
    state.status = value ? "clipboard-checked" : state.text ? "changed" : "empty";
    void writeState();
  }

  function updateFocus(focusedElement) {
    state.focusedElement = String(focusedElement);
    void writeState();
  }

  ipcMain.on("qa-host:update-input", (_event, text) => updateText(text));
  ipcMain.on("qa-host:update-clipboard", (_event, text) => updateClipboardProbe(text));
  ipcMain.on("qa-host:update-focus", (_event, value) => updateFocus(value));
  ipcMain.on("qa-host:request-state", () => { void writeState(); });
  ipcMain.on("qa-host:export-state", () => {
    state.exportedAt = new Date().toISOString();
    void writeState();
  });

  mainWindow = new BrowserWindow({
    title: QA_INPUT_HOST_TITLE,
    width: 900,
    height: 680,
    minWidth: 620,
    minHeight: 480,
    show: true,
    backgroundColor: "#10151d",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: fileURLToPath(import.meta.url),
    },
  });
  mainWindow.on("closed", () => { mainWindow = undefined; });
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildQaInputHostHtml())}`);
  await writeState();
}

if (process.type === "renderer") {
  const { contextBridge, ipcRenderer } = await import("electron");
  contextBridge.exposeInMainWorld("qaHost", Object.freeze({
    updateInput(value) { ipcRenderer.send("qa-host:update-input", String(value)); },
    updateClipboardProbe(value) { ipcRenderer.send("qa-host:update-clipboard", String(value)); },
    updateFocus(value) { ipcRenderer.send("qa-host:update-focus", String(value)); },
    exportState() { ipcRenderer.send("qa-host:export-state"); },
    requestState() { ipcRenderer.send("qa-host:request-state"); },
    onState(handler) {
      if (typeof handler !== "function") return;
      ipcRenderer.on("qa-host:state", (_event, value) => handler(value));
    },
  }));
} else if (process.versions?.electron) {
  const electron = await import("electron");
  const { app } = electron;
  const requestedUserDataPath = parseArgument("qa-user-data", "");
  if (!requestedUserDataPath) {
    throw new Error("QA host requires --qa-user-data");
  }
  const userDataPath = validateExplicitUserDataPath(requestedUserDataPath);
  app.setPath("userData", userDataPath);
  if (path.resolve(app.getPath("userData")) !== userDataPath) {
    throw new Error("QA host app.getPath('userData') mismatch");
  }
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
  } else {
    app.setName(QA_INPUT_HOST_TITLE);
    app.whenReady().then(() => runQaHost(electron).catch((error) => {
      process.stderr.write(`QA host failed: ${error?.message ?? String(error)}\n`);
      app.exit(1);
    }));
    app.on("window-all-closed", () => app.quit());
  }
}
