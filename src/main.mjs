import { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, screen, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_ENDPOINT,
  MODEL_STYLES,
  PROMPT_MODES,
  checkModel,
  enhancePrompt,
  isPromptMode,
  resolveModelStyle,
} from './core/promptEnhancer.mjs';
import { createCapturedPayload, hasVisiblePromptText } from './core/capturePayload.mjs';
import { createEncryptedModelConfigStore } from './core/modelConfigStore.mjs';
import { createReplacementTransactionStore } from './core/replacementTransactionStore.mjs';
import { createWindowStateStore } from './core/windowStateStore.mjs';
import { serializeIpcError, serializeIpcResult } from './core/ipcProtocol.mjs';
import {
  createWindowDragSession,
  normalizeDragPoint,
  resolveWindowDragBounds,
  updateWindowDragSession,
} from './core/windowDrag.mjs';
import {
  capturePrompt,
  copyText,
  getForegroundTarget,
  replacePrompt,
} from './platform/windowsBridge.mjs';
import { createWindowsDoubleAltListener } from './platform/windowsAltShortcut.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let tray;
let isQuitting = false;
let captureInFlight = false;
let captureSequence = 0;
let lastTarget;
let lastTargetCapturedAt = 0;
const TARGET_SNAPSHOT_TTL_MS = 15_000;
let foregroundTargetSnapshot;
let modelConfigStore;
let windowStateStore;
let windowStateSaveTimer;
let persistedWindowBounds;
let doubleAltListener;
let windowDragSession;
let windowDragScheduled = false;
const cancelledRequestIds = new Set();
const activeModelRequests = new Map();
const replacementTransactions = createReplacementTransactionStore();
const gotSingleInstanceLock = app.requestSingleInstanceLock();
let state = {
  original: '',
  enhanced: '',
  target: null,
};
let modelConfig = {
  endpoint: DEFAULT_MODEL_ENDPOINT,
  model: DEFAULT_MODEL,
  apiKey: '',
  style: MODEL_STYLES.concise,
  mode: PROMPT_MODES.enhance,
  targetWindowTitlePattern: '',
  apiKeySaved: false,
  storageAvailable: true,
};

function toIpcError(error) {
  return {
    code: error?.code ?? 'PROMPT_LIFT_ERROR',
    message: error instanceof Error ? error.message : String(error),
  };
}

function createConfigError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function configureModel(_event, input = {}, { persist = true } = {}) {
  const endpoint = typeof input.endpoint === 'string' && input.endpoint.trim().length > 0
    ? input.endpoint.trim()
    : DEFAULT_MODEL_ENDPOINT;
  const model = typeof input.model === 'string' && input.model.trim().length > 0
    ? input.model.trim()
    : DEFAULT_MODEL;
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const resolvedApiKey = apiKey || modelConfig.apiKey;
  const style = resolveModelStyle(input.style) ?? modelConfig.style;
  const targetWindowTitlePattern = typeof input.targetWindowTitlePattern === 'string'
    ? input.targetWindowTitlePattern.trim()
    : modelConfig.targetWindowTitlePattern;

  if (endpoint.length > 2_000) {
    throw createConfigError('MODEL_CONFIG_INVALID', '模型接口地址过长。');
  }
  if (model.length > 200) {
    throw createConfigError('MODEL_CONFIG_INVALID', '模型名称过长。');
  }
  if (apiKey.length > 4_096) {
    throw createConfigError('MODEL_CONFIG_INVALID', 'API Key 格式无效。');
  }
  if (targetWindowTitlePattern.length > 2_000) {
    throw createConfigError('MODEL_CONFIG_INVALID', '目标窗口标题关键词过长。');
  }
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw createConfigError('MODEL_CONFIG_INVALID', '模型接口地址无效。');
  }
  if (!resolvedApiKey) {
    throw createConfigError('API_KEY_REQUIRED', '请先填写 API Key。');
  }

  modelConfig = {
    endpoint,
    model,
    apiKey: resolvedApiKey,
    style,
    mode: modelConfig.mode,
    targetWindowTitlePattern,
    apiKeySaved: modelConfig.apiKeySaved,
    storageAvailable: modelConfig.storageAvailable,
  };
  const persistence = persist
    ? await persistModelConfig()
    : {
      saved: modelConfig.apiKeySaved,
      storageAvailable: modelConfig.storageAvailable,
    };
  return {
    configured: true,
    endpoint,
    model,
    style,
    targetWindowTitlePattern,
    apiKeySaved: persistence.saved,
    storageAvailable: persistence.storageAvailable,
  };
}

async function persistModelConfig() {
  if (!modelConfigStore) {
    return { saved: false, storageAvailable: false, reason: 'NOT_READY' };
  }
  const result = await modelConfigStore.save(modelConfig);
  modelConfig.apiKeySaved = result.saved === true;
  modelConfig.storageAvailable = result.storageAvailable === true;
  return result;
}

async function loadPersistedModelConfig() {
  modelConfigStore = createEncryptedModelConfigStore({
    userDataPath: app.getPath('userData'),
    safeStorage,
  });
  const persisted = await modelConfigStore.load();
  if (typeof persisted.endpoint === 'string' && persisted.endpoint.length > 0) {
    modelConfig.endpoint = persisted.endpoint;
  }
  if (typeof persisted.model === 'string' && persisted.model.length > 0) {
    modelConfig.model = persisted.model;
  }
  const persistedStyle = resolveModelStyle(persisted.style);
  if (persistedStyle) {
    modelConfig.style = persistedStyle;
  }
  if (isPromptMode(persisted.mode)) {
    modelConfig.mode = persisted.mode;
  }
  if (typeof persisted.targetWindowTitlePattern === 'string') {
    modelConfig.targetWindowTitlePattern = persisted.targetWindowTitlePattern;
  }
  modelConfig.apiKey = typeof persisted.apiKey === 'string' ? persisted.apiKey : '';
  modelConfig.apiKeySaved = persisted.apiKeySaved === true;
  modelConfig.storageAvailable = persisted.storageAvailable === true;
}

function getModelConfig() {
  return {
    endpoint: modelConfig.endpoint,
    model: modelConfig.model,
    style: modelConfig.style,
    mode: modelConfig.mode,
    targetWindowTitlePattern: modelConfig.targetWindowTitlePattern,
    apiKeySaved: modelConfig.apiKeySaved === true,
    storageAvailable: modelConfig.storageAvailable === true,
  };
}

async function setPromptStyle(_event, input = {}) {
  const style = resolveModelStyle(input.style);
  if (!style) {
    throw createConfigError('STYLE_INVALID', '提示词风格无效。');
  }
  modelConfig.style = style;
  const persistence = await persistModelConfig();
  return { style, apiKeySaved: persistence.saved };
}

async function setPromptMode(_event, input = {}) {
  const mode = typeof input.mode === 'string' ? input.mode : '';
  if (!isPromptMode(mode)) {
    throw createConfigError('MODE_INVALID', '提示词工作模式无效。');
  }
  modelConfig.mode = mode;
  const persistence = await persistModelConfig();
  return { mode, apiKeySaved: persistence.saved };
}

function clampBoundsToWorkArea(bounds) {
  const { workArea } = screen.getDisplayMatching(bounds);
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  return {
    x: Math.min(
      Math.max(bounds.x, workArea.x),
      workArea.x + workArea.width - width,
    ),
    y: Math.min(
      Math.max(bounds.y, workArea.y),
      workArea.y + workArea.height - height,
    ),
    width,
    height,
  };
}

function isExpandedAssistantBounds(bounds) {
  return Number.isSafeInteger(bounds?.width)
    && Number.isSafeInteger(bounds?.height)
    && bounds.width >= 320
    && bounds.height >= 480;
}

function scheduleWindowStateSave() {
  clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(() => {
    if (windowStateStore && mainWindow && !mainWindow.isDestroyed()) {
      void windowStateStore.save(mainWindow.getBounds()).catch(() => {});
    }
  }, 250);
}

function keepAssistantVisible() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.setBounds(clampBoundsToWorkArea(mainWindow.getBounds()), false);
  scheduleWindowStateSave();
}

function resizeWindow(_event, input = {}) {
  const width = Number(input.width);
  const height = Number(input.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw createConfigError('WINDOW_SIZE_INVALID', '窗口尺寸无效。');
  }

  const nextWidth = Math.min(700, Math.max(112, width));
  const nextHeight = Math.min(820, Math.max(112, height));
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    const anchorTopRight = input.anchor === 'top-right';
    const nextBounds = clampBoundsToWorkArea({
      x: bounds.x,
      y: anchorTopRight ? bounds.y + bounds.height - nextHeight : bounds.y,
      width: nextWidth,
      height: nextHeight,
    });
    mainWindow.setBounds(nextBounds, false);
    mainWindow.setFocusable(isExpandedAssistantBounds({
      width: nextWidth,
      height: nextHeight,
    }));
    if (input.persist !== false) {
      scheduleWindowStateSave();
    }
  }
  return { width: nextWidth, height: nextHeight };
}

function moveWindowBy(_event, input = {}) {
  const deltaX = Number(input.deltaX);
  const deltaY = Number(input.deltaY);
  if (!Number.isSafeInteger(deltaX) || !Number.isSafeInteger(deltaY)) {
    throw createConfigError('WINDOW_MOVE_INVALID', '窗口移动距离无效。');
  }
  if (Math.abs(deltaX) > 2_000 || Math.abs(deltaY) > 2_000) {
    throw createConfigError('WINDOW_MOVE_INVALID', '窗口移动距离过大。');
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    const nextBounds = clampBoundsToWorkArea({
      ...bounds,
      x: bounds.x + deltaX,
      y: bounds.y + deltaY,
    });
    mainWindow.setPosition(nextBounds.x, nextBounds.y, false);
    scheduleWindowStateSave();
    return { x: nextBounds.x, y: nextBounds.y };
  }
  return { x: 0, y: 0 };
}

function isMainWindowSender(event) {
  return mainWindow
    && !mainWindow.isDestroyed()
    && event.sender === mainWindow.webContents;
}

function applyPendingWindowDrag() {
  windowDragScheduled = false;
  if (!windowDragSession || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const nextBounds = clampBoundsToWorkArea(resolveWindowDragBounds(windowDragSession));
  mainWindow.setPosition(nextBounds.x, nextBounds.y, false);
}

function startWindowDrag(event, input = {}) {
  const point = normalizeDragPoint(input);
  if (!point || !isMainWindowSender(event)) {
    return;
  }
  windowDragSession = createWindowDragSession(point, mainWindow.getBounds());
}

function updateWindowDrag(event, input = {}) {
  const point = normalizeDragPoint(input);
  if (!point || !windowDragSession || !isMainWindowSender(event)) {
    return;
  }
  updateWindowDragSession(windowDragSession, point);
  if (!windowDragScheduled) {
    windowDragScheduled = true;
    setImmediate(applyPendingWindowDrag);
  }
}

function endWindowDrag(event, input = {}) {
  if (!windowDragSession || !isMainWindowSender(event)) {
    return;
  }
  const point = normalizeDragPoint(input);
  if (point) {
    updateWindowDragSession(windowDragSession, point);
  }
  applyPendingWindowDrag();
  windowDragSession = undefined;
  scheduleWindowStateSave();
}

function getStartupState() {
  const settings = app.getLoginItemSettings();
  return { enabled: settings.openAtLogin === true };
}

function setStartup(_event, input = {}) {
  const enabled = input.enabled === true;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
  });
  return getStartupState();
}

async function checkConfiguredModel(_event, input = {}) {
  const previousConfig = { ...modelConfig };
  try {
    await configureModel(undefined, input, { persist: false });
    const result = await checkModel(modelConfig);
    return { ...result, model: modelConfig.model };
  } finally {
    modelConfig = previousConfig;
  }
}

function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function handleIpc(channel, handler) {
  ipcMain.handle(channel, async (event, input) => {
    try {
      return serializeIpcResult(await handler(event, input));
    } catch (error) {
      return serializeIpcError(error);
    }
  });
}

function startDoubleAltListener() {
  doubleAltListener = createWindowsDoubleAltListener({
    onTrigger: () => {
      void captureFromTarget(undefined, { autoEnhance: true });
    },
    onError: (error) => {
      console.warn(`Prompt Pet: 双击 Alt 快捷键不可用（${error?.message ?? 'Windows 键盘监听启动失败'}）。`);
    },
  });
  doubleAltListener.start();
}

function reuseSingleAssistantWindow() {
  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed());
  if (windows.length === 0) {
    return undefined;
  }
  const survivor = mainWindow && !mainWindow.isDestroyed()
    ? mainWindow
    : windows[0];
  for (const window of windows) {
    if (window !== survivor) {
      window.destroy();
    }
  }
  mainWindow = survivor;
  return survivor;
}

function createWindow() {
  const existingWindow = reuseSingleAssistantWindow();
  if (existingWindow) {
    return existingWindow;
  }

  const window = new BrowserWindow({
    width: 120,
    height: 140,
    show: false,
    resizable: true,
    minWidth: 88,
    minHeight: 96,
    maxWidth: 700,
    maxHeight: 820,
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  });
  mainWindow = window;

  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
    }
  });
  window.webContents.on('render-process-gone', () => {
    if (!isQuitting && !window.isDestroyed()) {
      if (mainWindow === window) {
        mainWindow = undefined;
      }
      window.destroy();
    }
  });
  window.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isQuitting && isMainFrame && errorCode !== -3 && !window.isDestroyed()) {
      if (mainWindow === window) {
        mainWindow = undefined;
      }
      window.destroy();
    }
  });
  window.on('will-focus', () => {
    void rememberForegroundTarget();
  });
  window.on('blur', () => {
    void rememberForegroundTarget();
  });
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });
  return window;
}

function showAssistant({ focus = true } = {}) {
  if (!app.isReady()) {
    return undefined;
  }
  const window = createWindow();
  if (window.isMinimized()) {
    window.restore();
  }
  if (!window.isVisible()) {
    window.show();
  }
  if (focus) {
    window.focus();
  }
  return window;
}

function showAssistantMenu() {
  const window = showAssistant();
  if (!window) {
    return;
  }
  const openMenu = () => sendToWindow('prompt:menu:open', {});
  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', openMenu);
  } else {
    openMenu();
  }
}

async function rememberForegroundTarget() {
  if (foregroundTargetSnapshot) {
    return foregroundTargetSnapshot;
  }
  foregroundTargetSnapshot = (async () => {
    try {
      const candidate = await getForegroundTarget();
      if (
        candidate?.handle
        && candidate.processId !== process.pid
        && !/prompt\s*(?:lift|pet)/i.test(candidate.title ?? '')
      ) {
        lastTarget = candidate;
        lastTargetCapturedAt = Date.now();
        return candidate;
      }
    } catch {
      // A recent immutable target snapshot may still be available.
    }
    return undefined;
  })().finally(() => {
    foregroundTargetSnapshot = undefined;
  });
  return foregroundTargetSnapshot;
}

async function captureFromTarget(_event, input = {}) {
  if (captureInFlight) {
    return;
  }

  captureInFlight = true;
  const sequence = ++captureSequence;
  sendToWindow('prompt:status', { status: 'loading', message: '正在读取当前输入框…' });
  try {
    const requestedPattern = typeof input?.targetWindowTitlePattern === 'string'
      ? input.targetWindowTitlePattern.trim()
      : '';
    const targetWindowTitlePattern = requestedPattern || modelConfig.targetWindowTitlePattern;
    // A title keyword is only a qualification check for the window that was
    // actually focused. It must never select an arbitrary first matching app.
    const foregroundTarget = await rememberForegroundTarget();
    const recentTarget = Date.now() - lastTargetCapturedAt <= TARGET_SNAPSHOT_TTL_MS
      ? lastTarget
      : undefined;
    const captureTarget = foregroundTarget ?? recentTarget;
    if (!captureTarget) {
      throw createConfigError(
        'TARGET_REQUIRED',
        '没有可靠的目标输入框，请先聚焦目标聊天输入框后再试。',
      );
    }
    if (targetWindowTitlePattern
      && !String(captureTarget.title ?? '').toLocaleLowerCase()
        .includes(targetWindowTitlePattern.toLocaleLowerCase())) {
      throw createConfigError(
        'TARGET_PATTERN_MISMATCH',
        '当前聚焦窗口与目标窗口标题关键词不匹配，请重新聚焦正确窗口。',
      );
    }
    const captured = await capturePrompt(captureTarget);
    if (sequence !== captureSequence) {
      return { cancelled: true };
    }
    const original = String(captured?.text ?? '');
    if (!hasVisiblePromptText(original)) {
      const error = new Error('当前输入框为空，请先在 Codex 或 Claude 中输入提示词。');
      error.code = 'EMPTY_PROMPT';
      throw error;
    }

    const capturedPayload = {
      ...createCapturedPayload(original, captured.target),
      autoEnhance: input?.autoEnhance === true,
    };
        state = {
          original,
          enhanced: '',
          target: capturedPayload.target,
        };
        replacementTransactions.clear();
    lastTarget = capturedPayload.target ?? lastTarget;
    lastTargetCapturedAt = Date.now();
    createWindow().showInactive();
    sendToWindow('prompt:captured', capturedPayload);
    sendToWindow('prompt:status', { status: 'ready' });
    return capturedPayload;
  } catch (error) {
    createWindow().showInactive();
    const captureError = error?.code === 'POWERSHELL_FAILED'
      && /No external chat window is available/i.test(error.message ?? '')
      ? createConfigError('TARGET_REQUIRED', '没有可用的外部聊天窗口，请先打开 Codex、Claude 或微信。')
      : error;
    sendToWindow('prompt:error', toIpcError(captureError));
  } finally {
    captureInFlight = false;
  }
}

function registerIpc() {
  ipcMain.on('prompt:drag:start', startWindowDrag);
  ipcMain.on('prompt:drag:move', updateWindowDrag);
  ipcMain.on('prompt:drag:end', endWindowDrag);
  handleIpc('prompt:target:remember', rememberForegroundTarget);
  handleIpc('prompt:capture', captureFromTarget);
  handleIpc('prompt:configure', configureModel);
  handleIpc('prompt:model:get', getModelConfig);
  handleIpc('prompt:style:set', setPromptStyle);
  handleIpc('prompt:mode:set', setPromptMode);
  handleIpc('prompt:resize', resizeWindow);
  handleIpc('prompt:move', moveWindowBy);
  handleIpc('prompt:model:check', checkConfiguredModel);
  handleIpc('prompt:startup:get', getStartupState);
  handleIpc('prompt:startup:set', setStartup);
  handleIpc('prompt:hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    return { hidden: true };
  });
  handleIpc('prompt:quit', () => {
    isQuitting = true;
    app.quit();
    return { quitting: true };
  });

  handleIpc('prompt:enhance', async (_event, input) => {
    const original = String(input?.text ?? state.original ?? '');
    const requestId = typeof input?.requestId === 'string' ? input.requestId : '';
    const shouldReplace = input?.replace !== false;
    const operationTarget = state.target;
    if (!original.trim()) {
      const error = new Error('没有可增强的提示词。');
      error.code = 'EMPTY_PROMPT';
      throw error;
    }
    state.original = original;
    const controller = new AbortController();
    if (requestId) {
      replacementTransactions.clear();
      cancelledRequestIds.delete(requestId);
      activeModelRequests.get(requestId)?.abort();
      activeModelRequests.set(requestId, controller);
    }
    let enhanced;
    try {
      enhanced = await enhancePrompt(original, {
        endpoint: modelConfig.endpoint,
        model: modelConfig.model,
        apiKey: modelConfig.apiKey,
        style: modelConfig.style,
        mode: modelConfig.mode,
        useModel: true,
        signal: controller.signal,
      });
    } catch (error) {
      throw error;
    } finally {
      if (requestId && activeModelRequests.get(requestId) === controller) {
        activeModelRequests.delete(requestId);
      }
    }
    if (requestId && cancelledRequestIds.has(requestId)) {
      return { cancelled: true, text: '' };
    }
    if (requestId) {
      replacementTransactions.begin(requestId, {
        target: operationTarget,
        original,
      });
    }
    state.enhanced = enhanced;
    return {
      original: state.original,
      enhanced: state.enhanced,
      text: state.enhanced,
      replaced: shouldReplace,
    };
  });

  handleIpc('prompt:copy', async (_event, input) => {
    const text = String(input?.text ?? state.enhanced ?? state.original ?? '');
    if (!text.trim()) {
      const error = new Error('没有可复制的内容。');
      error.code = 'EMPTY_RESULT';
      throw error;
    }
    await copyText(text);
    return { copied: true };
  });

  handleIpc('prompt:apply', async (_event, input) => {
    const text = String(input?.text ?? state.enhanced ?? '');
    const operationId = typeof input?.operationId === 'string' ? input.operationId : '';
    if (!text.trim()) {
      const error = new Error('增强结果或目标输入框不可用，请重新读取提示词。');
      error.code = 'TARGET_UNAVAILABLE';
      throw error;
    }
    if (!operationId || cancelledRequestIds.has(operationId)) {
      throw createConfigError(
        'REPLACEMENT_CANCELLED',
        '本次处理已取消或失效，原始输入框未被覆盖。',
      );
    }
    try {
      const transaction = replacementTransactions.require(operationId);
      await replacePrompt(text, transaction.target, {
        expectedText: transaction.expectedText,
      });
      replacementTransactions.confirmApplied(operationId, text);
      state.enhanced = text;
      return { applied: true };
    } catch (error) {
      replacementTransactions.finish(operationId);
      throw error;
    }
  });

  handleIpc('prompt:restore', async (_event, input) => {
    const operationId = typeof input?.operationId === 'string' ? input.operationId : '';
    try {
      const transaction = replacementTransactions.require(operationId);
      await replacePrompt(transaction.original, transaction.target, {
        expectedText: transaction.expectedText,
      });
      replacementTransactions.finish(operationId);
      return { restored: true };
    } catch (error) {
      replacementTransactions.finish(operationId);
      throw error;
    }
  });

  handleIpc('prompt:cancel', (_event, input) => {
    captureSequence += 1;
    const requestId = typeof input?.requestId === 'string' ? input.requestId : '';
    if (requestId) {
      cancelledRequestIds.add(requestId);
      activeModelRequests.get(requestId)?.abort();
      activeModelRequests.delete(requestId);
      replacementTransactions.finish(requestId);
      if (cancelledRequestIds.size > 64) {
        cancelledRequestIds.delete(cancelledRequestIds.values().next().value);
      }
    }
    state = { original: '', enhanced: '', target: null };
    return { cancelled: true };
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABwSURBVDhPzYzBDYAwDAOzBC++rMNwTNwqqqMGh9JG4sFJfkTxWf7Jth9lFFTGsHCW63ZrUI1wUWUL/6B0uODlpRH/eJItvge1sSJbwkBG1oQBJTPyOjAb8T2oDf/QzGQN1A4XUrLBxZRssOCDyleIVBYhHYKBRvR9AAAAAElFTkSuQmCC',
  );
  tray = new Tray(icon);
  tray.setToolTip('Prompt Pet');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Prompt Pet 设置', click: () => showAssistantMenu() },
    { label: '一键处理当前输入框', click: () => {
      void captureFromTarget(undefined, { autoEnhance: true });
    } },
    { type: 'separator' },
    { label: '退出 Prompt Lift', click: () => {
      isQuitting = true;
      app.quit();
    } },
  ]));
  tray.on('click', () => showAssistantMenu());
  tray.on('double-click', () => showAssistantMenu());
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    reuseSingleAssistantWindow();
    showAssistant();
  });

  app.whenReady().then(async () => {
    await loadPersistedModelConfig();
    windowStateStore = createWindowStateStore({
      userDataPath: app.getPath('userData'),
    });
    persistedWindowBounds = await windowStateStore.load();
    const window = createWindow();
    if (persistedWindowBounds && !isExpandedAssistantBounds(persistedWindowBounds)) {
      window.setBounds(clampBoundsToWorkArea(persistedWindowBounds), false);
    } else {
      const { workArea } = screen.getPrimaryDisplay();
      window.setPosition(
        Math.max(workArea.x, workArea.x + workArea.width - window.getBounds().width - 28),
        Math.max(workArea.y, workArea.y + workArea.height - window.getBounds().height - 28),
      );
    }
    registerIpc();
    screen.on('display-removed', keepAssistantVisible);
    screen.on('display-metrics-changed', keepAssistantVisible);
    if (app.isPackaged || process.env.PROMPT_LIFT_SHOW_ON_START === '1') {
      window.showInactive();
    }
    createTray();

    startDoubleAltListener();
  });
}

app.on('will-quit', () => {
  isQuitting = true;
  doubleAltListener?.stop();
  tray?.destroy();
});

app.on('window-all-closed', (event) => {
  // The tray companion remains available until the user explicitly chooses退出.
  if (!isQuitting) {
    event.preventDefault();
  }
});
