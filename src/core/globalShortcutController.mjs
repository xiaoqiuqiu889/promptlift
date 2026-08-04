import {
  DEFAULT_SHORTCUT,
  normalizeShortcut,
  shortcutDisplayLabel,
} from "./shortcutConfig.mjs";

function shortcutError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function createGlobalShortcutController({
  globalShortcut,
  createDoubleAltListener,
  onTrigger,
  onError = () => {},
} = {}) {
  if (!globalShortcut || typeof globalShortcut.register !== "function") {
    throw new TypeError("globalShortcut adapter is required");
  }
  if (typeof createDoubleAltListener !== "function") {
    throw new TypeError("createDoubleAltListener is required");
  }
  if (typeof onTrigger !== "function") {
    throw new TypeError("onTrigger is required");
  }

  let active;

  function describe(shortcut) {
    return Object.freeze({
      shortcut,
      label: shortcutDisplayLabel(shortcut),
      kind: shortcut === DEFAULT_SHORTCUT ? "double-alt" : "accelerator",
    });
  }

  function release(current) {
    if (!current) {
      return;
    }
    if (current.kind === "double-alt") {
      current.listener.stop();
    } else {
      globalShortcut.unregister(current.shortcut);
    }
  }

  function activate(input) {
    const shortcut = normalizeShortcut(input);
    if (active?.shortcut === shortcut) {
      return describe(shortcut);
    }

    if (shortcut === DEFAULT_SHORTCUT) {
      const listener = createDoubleAltListener({ onTrigger, onError });
      if (!listener?.start?.()) {
        throw shortcutError("SHORTCUT_UNAVAILABLE", "双击左 Alt 监听启动失败，原快捷键保持不变。");
      }
      const previous = active;
      active = { shortcut, kind: "double-alt", listener };
      release(previous);
      return describe(shortcut);
    }

    const registered = globalShortcut.register(shortcut, onTrigger);
    if (!registered) {
      throw shortcutError(
        "SHORTCUT_CONFLICT",
        `“${shortcutDisplayLabel(shortcut)}”已被系统或其他应用占用，原快捷键保持不变。`,
      );
    }
    const previous = active;
    active = { shortcut, kind: "accelerator" };
    release(previous);
    return describe(shortcut);
  }

  function getActive() {
    return active ? describe(active.shortcut) : undefined;
  }

  function stop() {
    const previous = active;
    active = undefined;
    release(previous);
  }

  return Object.freeze({
    activate,
    getActive,
    stop,
  });
}
