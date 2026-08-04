import { contextBridge, ipcRenderer } from "electron";

const DEFAULT_SCENARIO = Object.freeze({
  captureDelay: 60,
  configureDelay: 20,
  enhanceDelay: 80,
  applyDelay: 80,
  checkDelay: 80,
  copyDelay: 20,
  restoreDelay: 20,
  cancelDelay: 20,
  captureError: false,
  configureError: false,
  enhanceError: false,
  applyError: false,
  checkError: false,
  copyError: false,
  restoreError: false,
  styleError: false,
  modeError: false,
  shortcutError: false,
  startupError: false,
});

const QA_TARGET = Object.freeze({
  handle: 424242,
  title: "Prompt Lift QA target",
  processId: 4242,
  focusHandle: 424242,
});

const qaState = {
  scenario: { ...DEFAULT_SCENARIO },
  model: {
    endpoint: "https://tokenhub.tencentmaas.com/v1",
    model: "deepseek-v4-flash",
    style: "balanced",
    mode: "enhance",
    targetWindowTitlePattern: "",
    apiKeySaved: false,
    storageAvailable: true,
  },
  startup: false,
  shortcut: "DoubleAlt",
  capturedText: "QA captured prompt: keep URL https://example.test/path and number 42.",
  callSequence: 0,
  systemPrompts: {},
};

const QA_SYSTEM_PROMPT_MODES = Object.freeze([
  "enhance",
  "upward-communication",
  "chat-polish",
  "ppt-copy",
]);
const QA_SYSTEM_PROMPT_STYLES = Object.freeze([
  "faithful",
  "concise",
  "professional",
  "creative",
]);

function systemPromptKey(mode, style) {
  return `${mode}:${style}`;
}

function createQaSystemPromptEntry(mode, style, customPrompt = "") {
  const defaultPrompt = `QA default system prompt for ${mode}/${style}. Preserve source facts and return one final result.`;
  const normalizedCustom = typeof customPrompt === "string" ? customPrompt.trim().slice(0, 6_000) : "";
  return {
    mode,
    style,
    defaultPrompt,
    customPrompt: normalizedCustom,
    effectivePrompt: normalizedCustom ? `${defaultPrompt}\n${normalizedCustom}` : defaultPrompt,
    customPromptMaxLength: 6_000,
  };
}

for (const mode of QA_SYSTEM_PROMPT_MODES) {
  for (const style of QA_SYSTEM_PROMPT_STYLES) {
    qaState.systemPrompts[systemPromptKey(mode, style)] = createQaSystemPromptEntry(mode, style);
  }
}

const capturedListeners = new Set();
const statusListeners = new Set();
const errorListeners = new Set();
const menuOpenListeners = new Set();
let dragPoint;

function delay(milliseconds) {
  const duration = Number.isFinite(Number(milliseconds))
    ? Math.max(0, Math.min(10_000, Number(milliseconds)))
    : 0;
  return new Promise((resolve) => setTimeout(resolve, duration));
}

function makeError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    error.details = details;
  }
  return error;
}

function emit(kind, payload = {}) {
  ipcRenderer.send("qa:message", {
    kind,
    ...payload,
  });
}

function record(name, details = {}) {
  qaState.callSequence += 1;
  emit("api-call", {
    sequence: qaState.callSequence,
    name,
    ...details,
  });
}

function scenarioError(name) {
  const value = qaState.scenario[name];
  if (!value) {
    return undefined;
  }
  if (typeof value === "object") {
    return makeError(
      typeof value.code === "string" ? value.code : "QA_MOCK_ERROR",
      typeof value.message === "string" ? value.message : "QA mock operation failed",
      value.details,
    );
  }
  const defaults = {
    captureError: ["TARGET_REQUIRED", "QA capture failed"],
    configureError: ["API_KEY_REQUIRED", "QA configure failed"],
    enhanceError: ["AUTH_ERROR", "QA enhance failed"],
    applyError: ["REPLACE_NOT_CONFIRMED", "QA apply failed"],
    checkError: ["AUTH_ERROR", "QA model check failed"],
    copyError: ["CLIPBOARD_UNAVAILABLE", "QA copy failed"],
    restoreError: ["REPLACE_NOT_CONFIRMED", "QA restore failed"],
    styleError: ["STYLE_INVALID", "QA style change failed"],
    modeError: ["MODE_INVALID", "QA mode change failed"],
    shortcutError: ["SHORTCUT_CONFLICT", "QA shortcut conflict"],
    startupError: ["QA_STARTUP_ERROR", "QA startup change failed"],
  };
  const [code, message] = defaults[name] ?? ["QA_MOCK_ERROR", "QA mock operation failed"];
  return makeError(code, message);
}

function updateScenario(patch = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return;
  }
  const next = { ...patch };
  delete next.resetCalls;
  if (typeof next.capturedText === "string") {
    qaState.capturedText = next.capturedText;
  }
  delete next.capturedText;
  qaState.scenario = {
    ...qaState.scenario,
    ...next,
  };
  if (patch.resetCalls === true) {
    qaState.callSequence = 0;
    emit("api-reset");
  }
  emit("scenario", {
    scenario: Object.fromEntries(
      Object.entries(qaState.scenario).filter(([key]) => !/key|prompt|text/i.test(key)),
    ),
  });
}

function sanitizeModelInput(config = {}) {
  return {
    endpoint: typeof config.endpoint === "string" ? config.endpoint.trim() : "",
    model: typeof config.model === "string" ? config.model.trim() : "",
    targetWindowTitlePattern: typeof config.targetWindowTitlePattern === "string"
      ? config.targetWindowTitlePattern.trim()
      : "",
    hasApiKey: typeof config.apiKey === "string" && config.apiKey.trim().length > 0,
    apiKeyLength: typeof config.apiKey === "string" ? config.apiKey.length : 0,
  };
}

function normalizeDelay(name) {
  return qaState.scenario[name] ?? DEFAULT_SCENARIO[name] ?? 0;
}

const promptLiftApi = Object.freeze({
  configure(config = {}) {
    const normalized = sanitizeModelInput(config);
    record("configure", {
      endpoint: normalized.endpoint,
      model: normalized.model,
      targetWindowTitlePattern: normalized.targetWindowTitlePattern,
      hasApiKey: normalized.hasApiKey,
      apiKeyLength: normalized.apiKeyLength,
    });
    return delay(normalizeDelay("configureDelay")).then(() => {
      const error = scenarioError("configureError");
      if (error) {
        throw error;
      }
      qaState.model.endpoint = normalized.endpoint || qaState.model.endpoint;
      qaState.model.model = normalized.model || qaState.model.model;
      qaState.model.targetWindowTitlePattern = normalized.targetWindowTitlePattern;
      if (normalized.hasApiKey) {
        qaState.model.apiKeySaved = true;
      }
      return {
        configured: true,
        endpoint: qaState.model.endpoint,
        model: qaState.model.model,
        style: qaState.model.style,
        targetWindowTitlePattern: qaState.model.targetWindowTitlePattern,
        apiKeySaved: qaState.model.apiKeySaved,
        storageAvailable: true,
      };
    });
  },

  getModelConfig() {
    record("getModelConfig");
    return Promise.resolve({ ...qaState.model });
  },

  getShortcut() {
    record("getShortcut");
    return Promise.resolve({
      shortcut: qaState.shortcut,
      configuredShortcut: qaState.shortcut,
      label: qaState.shortcut === "DoubleAlt" ? "双击左 Alt" : qaState.shortcut,
      kind: qaState.shortcut === "DoubleAlt" ? "double-alt" : "accelerator",
      warning: "",
    });
  },

  setShortcut(shortcut) {
    record("setShortcut", {
      shortcut: typeof shortcut === "string" ? shortcut : "",
    });
    return delay(normalizeDelay("configureDelay")).then(() => {
      const error = scenarioError("shortcutError");
      if (error) {
        throw error;
      }
      qaState.shortcut = shortcut;
      return {
        shortcut,
        configuredShortcut: shortcut,
        label: shortcut === "DoubleAlt" ? "双击左 Alt" : shortcut,
        kind: shortcut === "DoubleAlt" ? "double-alt" : "accelerator",
        warning: "",
      };
    });
  },

  getSystemPrompts() {
    record("getSystemPrompts");
    return Promise.resolve({
      version: 1,
      entries: Object.values(qaState.systemPrompts),
    });
  },

  saveSystemPrompt(input = {}) {
    record("saveSystemPrompt", {
      mode: typeof input.mode === "string" ? input.mode : "",
      style: typeof input.style === "string" ? input.style : "",
      customPromptLength: typeof input.customPrompt === "string" ? input.customPrompt.length : 0,
    });
    const key = systemPromptKey(input.mode, input.style);
    const previous = qaState.systemPrompts[key] ?? createQaSystemPromptEntry(input.mode, input.style);
    const next = createQaSystemPromptEntry(input.mode, input.style, input.customPrompt);
    qaState.systemPrompts[key] = { ...previous, ...next };
    return Promise.resolve(qaState.systemPrompts[key]);
  },

  resetSystemPrompt(input = {}) {
    record("resetSystemPrompt", {
      mode: typeof input.mode === "string" ? input.mode : "",
      style: typeof input.style === "string" ? input.style : "",
    });
    const key = systemPromptKey(input.mode, input.style);
    qaState.systemPrompts[key] = createQaSystemPromptEntry(input.mode, input.style);
    return Promise.resolve(qaState.systemPrompts[key]);
  },

  setStyle(style) {
    record("setStyle", { style: typeof style === "string" ? style : "" });
    return delay(normalizeDelay("configureDelay")).then(() => {
      const error = scenarioError("styleError");
      if (error) {
        throw error;
      }
      qaState.model.style = style;
      return { style, apiKeySaved: qaState.model.apiKeySaved };
    });
  },

  setMode(mode) {
    record("setMode", { mode: typeof mode === "string" ? mode : "" });
    return delay(normalizeDelay("configureDelay")).then(() => {
      const error = scenarioError("modeError");
      if (error) {
        throw error;
      }
      qaState.model.mode = mode;
      return { mode, apiKeySaved: qaState.model.apiKeySaved };
    });
  },

  resize(width, height, options = {}) {
    record("resize", {
      width,
      height,
      anchor: options.anchor === "top-right" ? "top-right" : "top-left",
      persist: options.persist !== false,
    });
    return ipcRenderer.invoke("qa:resize", {
      width,
      height,
      anchor: options.anchor === "top-right" ? "top-right" : "top-left",
      persist: options.persist !== false,
    });
  },

  moveBy(deltaX, deltaY) {
    record("moveBy", { deltaX, deltaY });
    return ipcRenderer.invoke("qa:move", { deltaX, deltaY });
  },

  startDrag(screenX, screenY) {
    dragPoint = { screenX, screenY };
    record("startDrag", { screenX, screenY });
  },

  updateDrag(screenX, screenY) {
    if (!dragPoint) {
      return;
    }
    const deltaX = screenX - dragPoint.screenX;
    const deltaY = screenY - dragPoint.screenY;
    dragPoint = { screenX, screenY };
    record("updateDrag", { screenX, screenY });
    void ipcRenderer.invoke("qa:move", { deltaX, deltaY });
  },

  endDrag(screenX, screenY) {
    if (dragPoint) {
      const deltaX = screenX - dragPoint.screenX;
      const deltaY = screenY - dragPoint.screenY;
      if (deltaX || deltaY) {
        void ipcRenderer.invoke("qa:move", { deltaX, deltaY });
      }
    }
    record("endDrag", { screenX, screenY });
    dragPoint = undefined;
  },

  checkModel(config = {}) {
    const normalized = sanitizeModelInput(config);
    record("checkModel", {
      endpoint: normalized.endpoint,
      model: normalized.model,
      targetWindowTitlePattern: normalized.targetWindowTitlePattern,
      hasApiKey: normalized.hasApiKey,
      apiKeyLength: normalized.apiKeyLength,
    });
    return delay(normalizeDelay("checkDelay")).then(() => {
      const error = scenarioError("checkError");
      if (error) {
        throw error;
      }
      return { ok: true, model: normalized.model || qaState.model.model };
    });
  },

  getStartup() {
    record("getStartup");
    return Promise.resolve({ enabled: qaState.startup });
  },

  setStartup(enabled) {
    record("setStartup", { enabled: enabled === true });
    return delay(normalizeDelay("configureDelay")).then(() => {
      const error = scenarioError("startupError");
      if (error) {
        throw error;
      }
      qaState.startup = enabled === true;
      return { enabled: qaState.startup };
    });
  },

  hide() {
    record("hide");
    return ipcRenderer.invoke("qa:hide");
  },

  quit() {
    record("quit");
    return Promise.resolve({ quitting: false, qaSuppressed: true });
  },

  capture(targetWindowTitlePattern = "") {
    record("capture", {
      targetWindowTitlePattern: typeof targetWindowTitlePattern === "string"
        ? targetWindowTitlePattern
        : "",
    });
    return delay(normalizeDelay("captureDelay")).then(() => {
      const error = scenarioError("captureError");
      if (error) {
        throw error;
      }
      return {
        text: qaState.capturedText,
        target: QA_TARGET,
      };
    });
  },

  enhance(payload = {}) {
    const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
    record("enhance", {
      requestIdPresent: typeof payload.requestId === "string" && payload.requestId.length > 0,
      promptLength: prompt.length,
      hasTarget: Boolean(payload.target),
      replace: payload.replace !== false,
    });
    return delay(normalizeDelay("enhanceDelay")).then(() => {
      const error = scenarioError("enhanceError");
      if (error) {
        throw error;
      }
      return {
        original: prompt,
        enhanced: `[QA ${qaState.model.mode}] ${prompt} Keep the output actionable.`,
        replaced: payload.replace !== false,
      };
    });
  },

  apply(text, target, options = {}) {
    record("apply", {
      textLength: typeof text === "string" ? text.length : 0,
      hasTarget: Boolean(target),
      expectedTextLength: typeof options.expectedText === "string"
        ? options.expectedText.length
        : 0,
      operationIdPresent: typeof options.operationId === "string"
        && options.operationId.length > 0,
      expectedTextMatchesCaptured: options.expectedText === qaState.capturedText,
    });
    return delay(normalizeDelay("applyDelay")).then(() => {
      const error = scenarioError("applyError");
      if (error) {
        throw error;
      }
      return { applied: true };
    });
  },

  copy(text) {
    record("copy", { textLength: typeof text === "string" ? text.length : 0 });
    return delay(normalizeDelay("copyDelay")).then(() => {
      const error = scenarioError("copyError");
      if (error) {
        throw error;
      }
      return { copied: true };
    });
  },

  cancel(requestId) {
    record("cancel", { requestIdPresent: typeof requestId === "string" && requestId.length > 0 });
    return delay(normalizeDelay("cancelDelay")).then(() => ({ cancelled: true }));
  },

  restore(text, target, options = {}) {
    record("restore", {
      textLength: typeof text === "string" ? text.length : 0,
      hasTarget: Boolean(target),
      expectedTextLength: typeof options.expectedText === "string"
        ? options.expectedText.length
        : 0,
    });
    return delay(normalizeDelay("restoreDelay")).then(() => {
      const error = scenarioError("restoreError");
      if (error) {
        throw error;
      }
      return { restored: true };
    });
  },

  onCaptured(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }
    capturedListeners.add(handler);
    return () => capturedListeners.delete(handler);
  },

  onStatus(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }
    statusListeners.add(handler);
    return () => statusListeners.delete(handler);
  },

  onError(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }
    errorListeners.add(handler);
    return () => errorListeners.delete(handler);
  },

  onMenuOpen(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("handler must be a function");
    }
    menuOpenListeners.add(handler);
    return () => menuOpenListeners.delete(handler);
  },
});

ipcRenderer.on("qa:set-scenario", (_event, patch) => updateScenario(patch));

ipcRenderer.on("qa:emit-status", (_event, payload) => {
  for (const listener of statusListeners) {
    listener(payload);
  }
});

ipcRenderer.on("qa:emit-error", (_event, payload = {}) => {
  const error = makeError(
    typeof payload.code === "string" ? payload.code : "QA_MOCK_ERROR",
    typeof payload.message === "string" ? payload.message : "QA mock error",
  );
  for (const listener of errorListeners) {
    listener(error);
  }
});

ipcRenderer.on("qa:emit-captured", (_event, payload = {}) => {
  for (const listener of capturedListeners) {
    listener(payload);
  }
});

ipcRenderer.on("qa:emit-menu-open", () => {
  for (const listener of menuOpenListeners) {
    listener();
  }
});

contextBridge.exposeInMainWorld("promptLift", promptLiftApi);
emit("preload-ready", {
  contextIsolation: true,
  nodeIntegration: false,
});
