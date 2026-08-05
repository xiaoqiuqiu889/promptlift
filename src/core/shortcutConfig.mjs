export const DEFAULT_SHORTCUT = "DoubleAlt";
export const MACOS_DEFAULT_SHORTCUT = "Shift+Super+P";

const MODIFIER_ORDER = Object.freeze(["Control", "Alt", "Shift", "Super"]);
const MODIFIER_ALIASES = Object.freeze({
  control: "Control",
  ctrl: "Control",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  super: "Super",
  meta: "Super",
  win: "Super",
  windows: "Super",
});

function shortcutError(message) {
  const error = new Error(message);
  error.code = "SHORTCUT_INVALID";
  return error;
}

function normalizeBaseKey(token) {
  const value = String(token ?? "").trim();
  if (/^[a-z]$/iu.test(value)) {
    return value.toUpperCase();
  }
  if (/^[0-9]$/u.test(value)) {
    return value;
  }
  if (/^space$/iu.test(value)) {
    return "Space";
  }
  const functionMatch = /^f([1-9]|1[0-2])$/iu.exec(value);
  if (functionMatch) {
    return `F${functionMatch[1]}`;
  }
  throw shortcutError("快捷键主按键仅支持字母、数字、Space 或 F1–F12。");
}

export function normalizeShortcut(input, { fallbackToDefault = true } = {}) {
  if (input === undefined || input === null || String(input).trim() === "") {
    if (fallbackToDefault) {
      return DEFAULT_SHORTCUT;
    }
    throw shortcutError("快捷键不能为空。");
  }

  const raw = String(input).trim();
  if (/^(?:double[-_ ]?alt|双击(?:左)?alt)$/iu.test(raw)) {
    return DEFAULT_SHORTCUT;
  }

  const tokens = raw.split("+").map((token) => token.trim()).filter(Boolean);
  if (tokens.length < 3) {
    throw shortcutError("自定义快捷键至少需要两个修饰键和一个主按键。");
  }

  const modifiers = new Set();
  const baseKeys = [];
  for (const token of tokens) {
    const modifier = MODIFIER_ALIASES[token.toLowerCase()];
    if (modifier) {
      if (modifiers.has(modifier)) {
        throw shortcutError("快捷键包含重复修饰键。");
      }
      modifiers.add(modifier);
    } else {
      baseKeys.push(token);
    }
  }
  if (modifiers.size < 2) {
    throw shortcutError("自定义快捷键至少需要两个修饰键。");
  }
  if (baseKeys.length !== 1) {
    throw shortcutError("快捷键必须且只能包含一个主按键。");
  }

  const baseKey = normalizeBaseKey(baseKeys[0]);
  return [
    ...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)),
    baseKey,
  ].join("+");
}

export function defaultShortcutForPlatform(platform = process.platform) {
  return platform === "darwin" ? MACOS_DEFAULT_SHORTCUT : DEFAULT_SHORTCUT;
}

export function shortcutDisplayLabel(input, { platform = process.platform } = {}) {
  const shortcut = normalizeShortcut(input);
  if (shortcut === DEFAULT_SHORTCUT) {
    return "双击左 Alt";
  }
  if (platform === "darwin") {
    const symbols = Object.freeze({
      Control: "⌃",
      Alt: "⌥",
      Shift: "⇧",
      Super: "⌘",
    });
    const tokens = shortcut.split("+");
    const baseKey = tokens.at(-1);
    const modifierOrder = ["Super", "Shift", "Alt", "Control"];
    return [
      ...modifierOrder.filter((modifier) => tokens.includes(modifier)),
      baseKey,
    ]
      .map((token) => symbols[token] ?? token)
      .join("");
  }
  return shortcut
    .split("+")
    .map((token) => token === "Control" ? "Ctrl" : token)
    .join(" + ");
}
