import { contextBridge, ipcRenderer } from "electron";
import { reviveIpcResponse } from "./core/ipcProtocol.mjs";
import { normalizeDragPoint } from "./core/windowDrag.mjs";

const MAX_PROMPT_LENGTH = 1_000_000;
const MAX_REQUEST_ID_LENGTH = 128;
const MAX_API_KEY_LENGTH = 4_096;
const MAX_ENDPOINT_LENGTH = 2_000;
const MAX_MODEL_LENGTH = 200;
const MAX_CUSTOM_SYSTEM_PROMPT_LENGTH = 6_000;
const MAX_SHORTCUT_LENGTH = 80;

export const PROMPT_LIFT_CHANNELS = Object.freeze({
  capture: "prompt:capture",
  rememberTarget: "prompt:target:remember",
  captured: "prompt:captured",
  status: "prompt:status",
  error: "prompt:error",
  menuOpen: "prompt:menu:open",
  enhance: "prompt:enhance",
  apply: "prompt:apply",
  copy: "prompt:copy",
  cancel: "prompt:cancel",
  restore: "prompt:restore",
  configure: "prompt:configure",
  modelGet: "prompt:model:get",
  shortcutGet: "prompt:shortcut:get",
  shortcutSet: "prompt:shortcut:set",
  systemPromptsGet: "prompt:system-prompts:get",
  systemPromptsSave: "prompt:system-prompts:save",
  systemPromptsReset: "prompt:system-prompts:reset",
  styleSet: "prompt:style:set",
  modeSet: "prompt:mode:set",
  resize: "prompt:resize",
  shapeSet: "prompt:shape:set",
  move: "prompt:move",
  dragStart: "prompt:drag:start",
  dragMove: "prompt:drag:move",
  dragEnd: "prompt:drag:end",
  modelCheck: "prompt:model:check",
  startupGet: "prompt:startup:get",
  startupSet: "prompt:startup:set",
  hide: "prompt:hide",
  quit: "prompt:quit",
});

function requireString(value, field, { allowEmpty = true, maxLength = MAX_PROMPT_LENGTH } = {}) {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  if (!allowEmpty && value.trim().length === 0) {
    throw new TypeError(`${field} must not be empty`);
  }
  if (value.length > maxLength) {
    throw new RangeError(`${field} is too large`);
  }
  return value;
}

function optionalString(value, field, { maxLength = MAX_PROMPT_LENGTH } = {}) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return requireString(value, field, { maxLength });
}

function normalizeRequestId(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireString(value, "requestId", {
    allowEmpty: false,
    maxLength: MAX_REQUEST_ID_LENGTH,
  });
}

function normalizeScreenPoint(screenX, screenY) {
  const point = normalizeDragPoint({ screenX, screenY });
  if (!point) {
    throw new TypeError("screen coordinates must be finite and within range");
  }
  return point;
}

function normalizeWindowShape(rects) {
  if (!Array.isArray(rects) || rects.length > 8) {
    throw new TypeError("window shape must be an array with at most 8 rectangles");
  }
  return rects.map((rect) => {
    if (!rect || typeof rect !== "object" || Array.isArray(rect)) {
      throw new TypeError("window shape rectangle must be an object");
    }
    const normalized = Object.fromEntries(
      ["x", "y", "width", "height"].map((field) => {
        const value = Number(rect[field]);
        if (!Number.isSafeInteger(value)) {
          throw new TypeError(`window shape ${field} must be a safe integer`);
        }
        return [field, value];
      }),
    );
    if (normalized.x < 0 || normalized.y < 0
      || normalized.width <= 0 || normalized.height <= 0) {
      throw new RangeError("window shape rectangles must have positive in-window bounds");
    }
    return normalized;
  });
}

function normalizeModelConfig(config = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("model config must be an object");
  }

  return {
    endpoint: requireString(config.endpoint ?? "", "endpoint", {
      maxLength: MAX_ENDPOINT_LENGTH,
    }),
    model: requireString(config.model ?? "", "model", {
      maxLength: MAX_MODEL_LENGTH,
    }),
    apiKey: requireString(config.apiKey ?? "", "apiKey", {
      allowEmpty: true,
      maxLength: MAX_API_KEY_LENGTH,
    }),
    targetWindowTitlePattern: requireString(
      config.targetWindowTitlePattern ?? "",
      "targetWindowTitlePattern",
      { maxLength: MAX_ENDPOINT_LENGTH },
    ),
  };
}

function normalizeSystemPromptSelection(input = {}, { includeCustom = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("system prompt selection must be an object");
  }
  const normalized = {
    mode: requireString(input.mode ?? "", "mode", {
      allowEmpty: false,
      maxLength: 40,
    }),
    style: requireString(input.style ?? "", "style", {
      allowEmpty: false,
      maxLength: 40,
    }),
  };
  if (includeCustom) {
    normalized.customPrompt = requireString(input.customPrompt ?? "", "customPrompt", {
      maxLength: MAX_CUSTOM_SYSTEM_PROMPT_LENGTH,
    });
  }
  return normalized;
}

function normalizeTarget(target) {
  if (target === undefined || target === null) {
    return undefined;
  }

  if (Number.isSafeInteger(target) && target > 0) {
    return { handle: target };
  }

  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw new TypeError("target must be a window identifier object");
  }

  const handle = target.handle ?? target.hwnd ?? target.windowHandle;
  if (!Number.isSafeInteger(handle) || handle <= 0) {
    throw new TypeError("target.handle must be a positive safe integer");
  }

  return {
    handle,
    ...(typeof target.title === "string" ? { title: target.title.slice(0, 2_000) } : {}),
    ...(Number.isSafeInteger(target.processId) ? { processId: target.processId } : {}),
    ...(Number.isSafeInteger(target.focusHandle) && target.focusHandle > 0
      ? { focusHandle: target.focusHandle }
      : {}),
  };
}

async function invoke(channel, payload) {
  const response = await ipcRenderer.invoke(channel, payload);
  const revived = reviveIpcResponse(response);
  if (revived.handled) {
    throw revived.error;
  }
  if (response && response.__promptLiftIpc === "ok") {
    return response.value;
  }
  // Keep compatibility with a development main process that has not yet
  // installed the response envelope.
  return response;
}

function subscribe(channel, handler) {
  if (typeof handler !== "function") {
    throw new TypeError("event handler must be a function");
  }
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function normalizeEnhancePayload(promptOrPayload, options = {}) {
  const source = typeof promptOrPayload === "string"
    ? { ...options, prompt: promptOrPayload }
    : promptOrPayload;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("enhance requires a prompt string or payload object");
  }

  return {
    requestId: normalizeRequestId(source.requestId),
    prompt: requireString(source.prompt, "prompt", { allowEmpty: false }),
    // Existing main.mjs reads `text`; `prompt` is retained for the documented
    // channel contract and for future main-process adapters.
    text: requireString(source.prompt, "prompt", { allowEmpty: false }),
    clarification: optionalString(source.clarification, "clarification", {
      maxLength: 2_000,
    }),
    target: normalizeTarget(source.target),
    // The main-process handler must only replace the source window after the
    // existing enhancer returns a non-empty successful result.
    replace: source.replace !== false,
  };
}

/**
 * Main-process IPC contract (the main process is intentionally outside the
 * permitted write scope):
 *
 * - prompt:capture -> bridge.capturePrompt(titlePattern); main may reply with prompt:captured
 * - prompt:enhance -> existing core enhancer; renderer then calls prompt:apply
 * - prompt:apply -> bridge.replacePrompt(result, capturedTarget)
 * - prompt:copy -> bridge.copyText(text)
 * - prompt:cancel -> abort/clear the matching in-flight enhancer request
 * - prompt:restore -> bridge.replacePrompt(originalText, capturedTarget)
 *
 * Register these with ipcMain.handle(). Never pass ipcRenderer itself through
 * contextBridge and never evaluate renderer-provided strings as PowerShell.
 */
const promptLiftApi = Object.freeze({
  rememberTarget() {
    return invoke(PROMPT_LIFT_CHANNELS.rememberTarget);
  },

  configure(config) {
    return invoke(PROMPT_LIFT_CHANNELS.configure, normalizeModelConfig(config));
  },

  getModelConfig() {
    return invoke(PROMPT_LIFT_CHANNELS.modelGet);
  },

  getShortcut() {
    return invoke(PROMPT_LIFT_CHANNELS.shortcutGet);
  },

  setShortcut(shortcut) {
    return invoke(PROMPT_LIFT_CHANNELS.shortcutSet, {
      shortcut: requireString(shortcut, "shortcut", {
        allowEmpty: false,
        maxLength: MAX_SHORTCUT_LENGTH,
      }),
    });
  },

  getSystemPrompts() {
    return invoke(PROMPT_LIFT_CHANNELS.systemPromptsGet);
  },

  saveSystemPrompt(input) {
    return invoke(
      PROMPT_LIFT_CHANNELS.systemPromptsSave,
      normalizeSystemPromptSelection(input, { includeCustom: true }),
    );
  },

  resetSystemPrompt(input) {
    return invoke(
      PROMPT_LIFT_CHANNELS.systemPromptsReset,
      normalizeSystemPromptSelection(input),
    );
  },

  setStyle(style) {
    return invoke(PROMPT_LIFT_CHANNELS.styleSet, {
      style: requireString(style, "style", { allowEmpty: false, maxLength: 40 }),
    });
  },

  setMode(mode) {
    return invoke(PROMPT_LIFT_CHANNELS.modeSet, {
      mode: requireString(mode, "mode", { allowEmpty: false, maxLength: 40 }),
    });
  },

  resize(width, height, options = {}) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
      throw new TypeError("window size must be safe integers");
    }
    return invoke(PROMPT_LIFT_CHANNELS.resize, {
      width,
      height,
      anchor: options.anchor === "top-right" ? "top-right" : "top-left",
      persist: options.persist !== false,
    });
  },

  setShape(rects) {
    return invoke(PROMPT_LIFT_CHANNELS.shapeSet, {
      rects: normalizeWindowShape(rects),
    });
  },

  moveBy(deltaX, deltaY) {
    if (!Number.isSafeInteger(deltaX) || !Number.isSafeInteger(deltaY)) {
      throw new TypeError("window move delta must be safe integers");
    }
    return invoke(PROMPT_LIFT_CHANNELS.move, { deltaX, deltaY });
  },

  startDrag(screenX, screenY) {
    ipcRenderer.send(
      PROMPT_LIFT_CHANNELS.dragStart,
      normalizeScreenPoint(screenX, screenY),
    );
  },

  updateDrag(screenX, screenY) {
    ipcRenderer.send(
      PROMPT_LIFT_CHANNELS.dragMove,
      normalizeScreenPoint(screenX, screenY),
    );
  },

  endDrag(screenX, screenY) {
    ipcRenderer.send(
      PROMPT_LIFT_CHANNELS.dragEnd,
      normalizeScreenPoint(screenX, screenY),
    );
  },

  checkModel(config) {
    return invoke(PROMPT_LIFT_CHANNELS.modelCheck, normalizeModelConfig(config));
  },

  getStartup() {
    return invoke(PROMPT_LIFT_CHANNELS.startupGet);
  },

  setStartup(enabled) {
    if (typeof enabled !== "boolean") {
      throw new TypeError("enabled must be a boolean");
    }
    return invoke(PROMPT_LIFT_CHANNELS.startupSet, { enabled });
  },

  hide() {
    return invoke(PROMPT_LIFT_CHANNELS.hide);
  },

  quit() {
    return invoke(PROMPT_LIFT_CHANNELS.quit);
  },

  capture(targetWindowTitlePattern) {
    if (targetWindowTitlePattern !== undefined) {
      requireString(targetWindowTitlePattern, "targetWindowTitlePattern", {
        maxLength: 2_000,
      });
    }
    return invoke(PROMPT_LIFT_CHANNELS.capture, {
      targetWindowTitlePattern: targetWindowTitlePattern ?? "",
    });
  },

  enhance(promptOrPayload, options) {
    return invoke(
      PROMPT_LIFT_CHANNELS.enhance,
      normalizeEnhancePayload(promptOrPayload, options),
    );
  },

  apply(text, target, options = {}) {
    return invoke(
      PROMPT_LIFT_CHANNELS.apply,
      {
        text: requireString(text, "text", { allowEmpty: false }),
        operationId: normalizeRequestId(options.operationId),
      },
    );
  },

  copy(text) {
    return invoke(
      PROMPT_LIFT_CHANNELS.copy,
      { text: requireString(text, "text") },
    );
  },

  cancel(requestId) {
    return invoke(
      PROMPT_LIFT_CHANNELS.cancel,
      { requestId: normalizeRequestId(requestId) },
    );
  },

  restore(text, target, options = {}) {
    return invoke(
      PROMPT_LIFT_CHANNELS.restore,
      {
        operationId: normalizeRequestId(options.operationId),
      },
    );
  },

  onCaptured(handler) {
    return subscribe(PROMPT_LIFT_CHANNELS.captured, handler);
  },

  onStatus(handler) {
    return subscribe(PROMPT_LIFT_CHANNELS.status, handler);
  },

  onError(handler) {
    return subscribe(PROMPT_LIFT_CHANNELS.error, handler);
  },

  onMenuOpen(handler) {
    return subscribe(PROMPT_LIFT_CHANNELS.menuOpen, handler);
  },
});

contextBridge.exposeInMainWorld("promptLift", promptLiftApi);
