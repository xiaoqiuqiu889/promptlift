import {
  hasVisiblePromptText,
  normalizeCapturedPrompt,
} from "../core/capturePayload.mjs";
import { withOperationDeadline } from "../core/operationDeadline.mjs";
import {
  DEFAULT_SHORTCUT,
  normalizeShortcut,
  shortcutDisplayLabel,
} from "../core/shortcutConfig.mjs";

const MAX_PROMPT_LENGTH = 1_000_000;
const MODE_STAGE_TIMEOUT_MS = 5_000;
const CONFIGURE_STAGE_TIMEOUT_MS = 8_000;
const MODEL_STAGE_TIMEOUT_MS = 20_000;
const APPLY_STAGE_TIMEOUT_MS = 15_000;
const DEFAULT_COMPACT_WIDTH = 120;
const DEFAULT_COMPACT_HEIGHT = 140;
const DEFAULT_EXPANDED_WIDTH = 420;
const DEFAULT_EXPANDED_HEIGHT = 620;
const MIN_COMPACT_WIDTH = 112;
const MIN_COMPACT_HEIGHT = 112;
const MAX_COMPACT_WIDTH = 700;
const MAX_COMPACT_HEIGHT = 820;
const COMPACT_SIZE_STORAGE_KEY = "prompt-pet.compact-size.v1";
const REVIEW_MODE_STORAGE_KEY = "prompt-pet.review-mode.v1";
const MASCOT_STORAGE_KEY = "prompt-pet.mascot.v1";
const STYLE_LABELS = Object.freeze({
  faithful: "原意守护",
  concise: "清晰直达",
  professional: "专业展开",
  creative: "创意策划",
});
const MODE_STYLE_PRESENTATION = Object.freeze({
  enhance: Object.freeze({
    faithful: Object.freeze({
      label: "原意守护",
      description: "只澄清目标与结构，不新增范围、假设或承诺",
    }),
    concise: Object.freeze({
      label: "清晰直达",
      description: "去除重复，补齐关键约束，用更短路径表达",
    }),
    professional: Object.freeze({
      label: "专业展开",
      description: "重组原文已有步骤、标准与边界，缺失项保持待确认",
    }),
    creative: Object.freeze({
      label: "创意策划",
      description: "在专业完整基础上增加可控创意方向与备选方案",
    }),
  }),
  "upward-communication": Object.freeze({
    faithful: Object.freeze({
      label: "事实直报",
      description: "保留事实、数字与原结论，不添加未经确认的判断",
    }),
    concise: Object.freeze({
      label: "结论先行",
      description: "结论前置，压缩背景，明确影响与下一步",
    }),
    professional: Object.freeze({
      label: "决策建议",
      description: "组织结论、依据、风险、选项与所需决策",
    }),
    creative: Object.freeze({
      label: "影响力表达",
      description: "在保真基础上增强叙事节奏与说服力，不夸大承诺",
    }),
  }),
  "chat-polish": Object.freeze({
    faithful: Object.freeze({
      label: "安全保真",
      description: "保留原意与责任边界，不扩大承诺或推断",
    }),
    concise: Object.freeze({
      label: "友好清晰",
      description: "更礼貌、更易读，直接说明重点与下一步",
    }),
    professional: Object.freeze({
      label: "专业服务",
      description: "使用稳定、克制、可执行的服务沟通结构",
    }),
    creative: Object.freeze({
      label: "共情化解",
      description: "先承接情绪再化解问题，仍保持事实与边界",
    }),
  }),
  "ppt-copy": Object.freeze({
    faithful: Object.freeze({
      label: "原文压缩",
      description: "压缩原文但保留事实、数字、逻辑与结论",
    }),
    concise: Object.freeze({
      label: "结论标题",
      description: "提炼结论型标题与一页最必要的信息",
    }),
    professional: Object.freeze({
      label: "结构化叙事",
      description: "构造成因、判断、证据与行动的清晰层级",
    }),
    creative: Object.freeze({
      label: "创意提案",
      description: "在事实不变前提下增加有记忆点的提案表达",
    }),
  }),
});
const LEGACY_STYLE_ALIASES = Object.freeze({
  balanced: "concise",
  detailed: "professional",
});
const MASCOTS = Object.freeze({
  cockapoo: Object.freeze({
    label: "可卡布犬 · 原风格",
    kind: "image",
    asset: "./assets/mascots/cockapoo.png",
  }),
  "green-knight-pup": Object.freeze({
    label: "绿色骑士小狗",
    kind: "image",
    asset: "./assets/mascots/green-knight-pup.png",
  }),
  "classic-green-knight": Object.freeze({
    label: "绿色骑士",
    kind: "css",
  }),
});
const MODE_LABELS = Object.freeze({
  enhance: "AI 提示词",
  "upward-communication": "向上沟通",
  "chat-polish": "用户沟通",
  "ppt-copy": "PPT 文案",
});
const MODE_PRESENTATION = Object.freeze({
  enhance: Object.freeze({
    action: "一键优化提示词",
    hint: "明确当前提示词的目标、上下文、约束和输出",
    badge: "AI",
    success: "AI 提示词优化完成。",
  }),
  "upward-communication": Object.freeze({
    action: "一键优化汇报",
    hint: "结论前置，整理依据、风险和下一步",
    badge: "上",
    success: "向上沟通文案优化完成。",
  }),
  "chat-polish": Object.freeze({
    action: "一键优化用户沟通",
    hint: "表达更安全、礼貌、清晰",
    badge: "客",
    success: "用户沟通文案优化完成。",
  }),
  "ppt-copy": Object.freeze({
    action: "一键优化 PPT 文案",
    hint: "优化当前整段文本，不读取整份演示",
    badge: "PPT",
    success: "PPT 文案优化完成。",
  }),
});
const HUB_LABELS = Object.freeze({
  process: "处理",
  services: "服务",
  profile: "我的",
});

const root = document.querySelector(".pet-shell");
const petCard = document.querySelector("#petCard");
const petAvatar = document.querySelector("#petAvatar");
const mascotImageFrame = document.querySelector("#mascotImageFrame");
const mascotImage = document.querySelector("#mascotImage");
const mascotSprite = document.querySelector("#mascotSprite");
const petAction = document.querySelector("#petAction");
const petActionTitle = document.querySelector("#petActionTitle");
const petActionHint = document.querySelector("#petActionHint");
const collapseButton = document.querySelector("#collapseButton");
const closeButton = document.querySelector("#closeButton");
const statusDot = document.querySelector("#statusDot");
const statusMessage = document.querySelector("#statusMessage");
const needsInputPanel = document.querySelector("#needsInputPanel");
const missingFields = document.querySelector("#missingFields");
const clarificationInput = document.querySelector("#clarificationInput");
const clarifyRegenerateButton = document.querySelector("#clarifyRegenerateButton");
const sourceInfo = document.querySelector("#sourceInfo");
const originalMeta = document.querySelector("#originalMeta");
const resultPanel = document.querySelector("#resultPanel");
const enhancedPrompt = document.querySelector("#enhancedPrompt");
const originalPreview = document.querySelector("#originalPreview");
const diffPreview = document.querySelector("#diffPreview");
const resultMeta = document.querySelector("#resultMeta");
const expressionSummaryMode = document.querySelector("#expressionSummaryMode");
const expressionSummaryStyle = document.querySelector("#expressionSummaryStyle");
const expressionSummaryLength = document.querySelector("#expressionSummaryLength");
const expressionSummarySafety = document.querySelector("#expressionSummarySafety");
const cancelButton = document.querySelector("#cancelButton");
const restoreButton = document.querySelector("#restoreButton");
const copyButton = document.querySelector("#copyButton");
const applyEditedButton = document.querySelector("#applyEditedButton");
const regenerateButton = document.querySelector("#regenerateButton");
const contextMenu = document.querySelector("#contextMenu");
const currentStyleLabel = document.querySelector("#currentStyleLabel");
const currentMascotLabel = document.querySelector("#currentMascotLabel");
const currentShortcutLabel = document.querySelector("#currentShortcutLabel");
const reviewModeButton = document.querySelector("#reviewModeButton");
const reviewModeLabel = document.querySelector("#reviewModeLabel");
const startupLabel = document.querySelector("#startupLabel");
const settingsPanel = document.querySelector("#settingsPanel");
const stylePanel = document.querySelector("#stylePanel");
const systemPromptPanel = document.querySelector("#systemPromptPanel");
const mascotPanel = document.querySelector("#mascotPanel");
const shortcutPanel = document.querySelector("#shortcutPanel");
const shortcutValue = document.querySelector("#shortcutValue");
const shortcutCaptureButton = document.querySelector("#shortcutCaptureButton");
const shortcutResetButton = document.querySelector("#shortcutResetButton");
const shortcutSaveButton = document.querySelector("#shortcutSaveButton");
const shortcutStatus = document.querySelector("#shortcutStatus");
const modelEndpoint = document.querySelector("#modelEndpoint");
const modelName = document.querySelector("#modelName");
const apiKeyInput = document.querySelector("#apiKey");
const modelStorageStatus = document.querySelector("#modelStorageStatus");
const targetWindowTitlePattern = document.querySelector("#targetWindowTitlePattern");
const checkModelButton = document.querySelector("#checkModelButton");
const saveModelButton = document.querySelector("#saveModelButton");
const viewSystemPromptButton = document.querySelector("#viewSystemPromptButton");
const systemPromptModeSelect = document.querySelector("#systemPromptModeSelect");
const systemPromptDefault = document.querySelector("#systemPromptDefault");
const systemPromptEffective = document.querySelector("#systemPromptEffective");
const systemPromptCustom = document.querySelector("#systemPromptCustom");
const saveSystemPromptButton = document.querySelector("#saveSystemPromptButton");
const resetSystemPromptButton = document.querySelector("#resetSystemPromptButton");
const systemPromptStatus = document.querySelector("#systemPromptStatus");
const resizeHandle = document.querySelector("#resizeHandle");
const compactModeBadge = document.querySelector("#compactModeBadge");
const compactFeedback = document.querySelector("#compactFeedback");
const compactFeedbackText = document.querySelector("#compactFeedbackText");
const compactCancelButton = document.querySelector("#compactCancelButton");
const hubHeading = document.querySelector("#hubHeading");
const hubModeValue = document.querySelector("#hubModeValue");
const hubStyleValue = document.querySelector("#hubStyleValue");
const hubReviewValue = document.querySelector("#hubReviewValue");
const hubReviewQuick = document.querySelector("#hubReviewQuick");
const hubPrimaryAction = document.querySelector("#hubPrimaryAction");
const hubPrimaryActionTitle = document.querySelector("#hubPrimaryActionTitle");
const hubPrimaryActionHint = document.querySelector("#hubPrimaryActionHint");
const hubPrivacyNote = document.querySelector("#hubPrivacyNote");
const hubSceneSelector = document.querySelector("#hubSceneSelector");
const hubTaskState = document.querySelector("#hubTaskState");
const hubModelStateLabel = document.querySelector("#hubModelStateLabel");
const hubModelCheckLabel = document.querySelector("#hubModelCheckLabel");
const hubMascotValue = document.querySelector("#hubMascotValue");
const hubStartupValue = document.querySelector("#hubStartupValue");
const profileMascotImage = document.querySelector("#profileMascotImage");
const profileMascotFallback = document.querySelector("#profileMascotFallback");
const helpPanel = document.querySelector("#helpPanel");
const helpShortcutLabel = document.querySelector("#helpShortcutLabel");
const api = globalThis.promptLift;

function readCompactSize() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMPACT_SIZE_STORAGE_KEY) ?? "null");
    const width = Number(saved?.width);
    const height = Number(saved?.height);
    if (Number.isSafeInteger(width)
      && Number.isSafeInteger(height)
      && width >= MIN_COMPACT_WIDTH
      && width <= MAX_COMPACT_WIDTH
      && height >= MIN_COMPACT_HEIGHT
      && height <= MAX_COMPACT_HEIGHT) {
      return { width, height };
    }
  } catch {
    // Local storage is optional; fall back to the safe default footprint.
  }
  return { width: DEFAULT_COMPACT_WIDTH, height: DEFAULT_COMPACT_HEIGHT };
}

function persistCompactSize(width, height) {
  try {
    localStorage.setItem(COMPACT_SIZE_STORAGE_KEY, JSON.stringify({ width, height }));
  } catch {
    // A failed preference write must not affect resizing or enhancement.
  }
}

function readReviewMode() {
  try {
    return localStorage.getItem(REVIEW_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistReviewMode(enabled) {
  try {
    localStorage.setItem(REVIEW_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // Review mode is a convenience preference; never persist user content.
  }
}

function normalizeStyle(style) {
  if (typeof style !== "string") {
    return "concise";
  }
  const normalized = LEGACY_STYLE_ALIASES[style] ?? style;
  return STYLE_LABELS[normalized] ? normalized : "concise";
}

function normalizeMascot(mascot) {
  return typeof mascot === "string" && MASCOTS[mascot] ? mascot : "cockapoo";
}

function readMascot() {
  try {
    return normalizeMascot(localStorage.getItem(MASCOT_STORAGE_KEY));
  } catch {
    return "cockapoo";
  }
}

function persistMascot(mascot) {
  try {
    localStorage.setItem(MASCOT_STORAGE_KEY, mascot);
  } catch {
    // The selected character is a non-sensitive preference; use it in memory.
  }
}

const initialCompactSize = readCompactSize();

const state = {
  phase: "idle",
  originalText: "",
  enhancedText: "",
  target: undefined,
  requestId: undefined,
  cancelled: false,
  style: "concise",
  mode: "enhance",
  mascot: readMascot(),
  startup: false,
  apiKeySaved: false,
  storageAvailable: true,
  modelConnection: "unchecked",
  modelConfigDirty: false,
  applying: false,
  replacementConfirmed: false,
  appliedText: "",
  generationOperationId: undefined,
  validatedText: "",
  resultMode: undefined,
  resultStyle: undefined,
  reviewMode: readReviewMode(),
  systemPrompts: [],
  systemPromptMode: "enhance",
  systemPromptStyle: "concise",
  systemPromptDirty: false,
  shortcut: DEFAULT_SHORTCUT,
  shortcutDraft: DEFAULT_SHORTCUT,
  shortcutRecording: false,
  hub: "process",
  view: "compact",
  compactWidth: initialCompactSize.width,
  compactHeight: initialCompactSize.height,
};

let pendingCapture;
let resizeSession;
let resizeFrame;
let dragSession;
let suppressAvatarClickUntil = 0;
let suppressMenuClickUntil = 0;
let compactFeedbackTimer;
let targetSnapshotPromise;

const messages = Object.freeze({
  idle: "准备就绪。左键处理当前发言，右键切换场景。",
  loading: "正在读取当前输入框并调用模型，请稍候…",
  success: "处理完成，结果已回填。原文仍可恢复或复制。",
  error: "操作失败，原始输入框未被覆盖，请检查设置后重试。",
});

function compactFeedbackMessage(phase, message) {
  if (phase === "loading") {
    return state.applying ? "正在回填…" : "处理中…";
  }
  if (phase === "success" && message.startsWith("场景已切换")) {
    return `已切换：${MODE_LABELS[state.mode] ?? MODE_LABELS.enhance}`;
  }
  if (phase === "success") {
    return "已完成";
  }
  const summary = String(message || messages.error);
  return summary.length > 18 ? `${summary.slice(0, 18)}…` : summary;
}

function setStatus(phase, message = messages[phase]) {
  state.phase = phase;
  root.dataset.state = phase;
  statusMessage.textContent = message;
  statusDot.dataset.state = phase;
  petAction.disabled = phase === "loading";
  petAvatar.disabled = false;
  const canCancelRequest = phase === "loading" && !state.applying;
  const canDiscardReview = state.reviewMode
    && phase !== "loading"
    && state.enhancedText.trim().length > 0
    && !state.replacementConfirmed;
  cancelButton.disabled = !(canCancelRequest || canDiscardReview);
  copyButton.disabled = phase === "loading" || enhancedPrompt.value.trim().length === 0;
  regenerateButton.disabled = phase === "loading" || state.originalText.trim().length === 0;
  applyEditedButton.disabled = phase === "loading"
    || enhancedPrompt.value.trim().length === 0
    || (state.replacementConfirmed && enhancedPrompt.value === state.appliedText);
  restoreButton.disabled = phase === "loading"
    || state.originalText.length === 0
    || !state.replacementConfirmed
    || typeof api?.restore !== "function";
  petActionHint.textContent = phase === "loading"
    ? "正在生成，原文保持不变"
    : (MODE_PRESENTATION[state.mode] ?? MODE_PRESENTATION.enhance).hint;
  updateHubOperationState();
  clearTimeout(compactFeedbackTimer);
  compactFeedback.hidden = phase === "idle";
  compactCancelButton.hidden = phase !== "loading" || state.applying;
  compactFeedbackText.textContent = compactFeedbackMessage(phase, message);
  if (phase === "success" || phase === "error") {
    compactFeedbackTimer = setTimeout(() => {
      compactFeedback.hidden = true;
    }, phase === "success" ? 3_000 : 5_000);
  }
}

function updateMeta() {
  originalMeta.textContent = state.originalText.length > 0
    ? state.originalText.length + " 字符"
    : "等待读取";
  resultMeta.textContent = state.enhancedText.length > 0
    ? state.enhancedText.length + " 字符"
    : "尚未生成";
  updateExpressionSummary();
}

function updateExpressionSummary() {
  const resultMode = state.resultMode ?? state.mode;
  const resultStyle = state.resultStyle ?? state.style;
  expressionSummaryMode.textContent = MODE_LABELS[resultMode] ?? MODE_LABELS.enhance;
  expressionSummaryStyle.textContent = MODE_STYLE_PRESENTATION[resultMode]?.[resultStyle]?.label
    ?? STYLE_LABELS[resultStyle]
    ?? STYLE_LABELS.concise;
  expressionSummaryLength.textContent = `${state.originalText.length} → ${state.enhancedText.length}`;
  expressionSummarySafety.textContent = state.validatedText
    && state.enhancedText !== state.validatedText
    ? "用户已编辑"
    : "安全校验通过";
}

function updateCompactScale() {
  const widthScale = window.innerWidth / state.compactWidth;
  const heightScale = window.innerHeight / state.compactHeight;
  const scale = Math.min(3.5, Math.max(0.75, Math.min(widthScale, heightScale)));
  root.style.setProperty("--pet-scale", String(scale));
}

function restoreCompactBounds() {
  if (typeof api?.resize !== "function") {
    return;
  }
  void api.resize(state.compactWidth, state.compactHeight, { persist: false }).catch(() => {
    // The main process may still be registering IPC during a cold start.
    setTimeout(() => {
      void api.resize(state.compactWidth, state.compactHeight, { persist: false }).catch(() => {});
    }, 120);
  });
}

function expandAssistant() {
  if (state.view === "expanded") {
    return;
  }
  state.view = "expanded";
  root.dataset.view = "expanded";
  void api.resize(DEFAULT_EXPANDED_WIDTH, DEFAULT_EXPANDED_HEIGHT, { persist: false });
}

function collapseAssistant() {
  if (state.view === "compact") {
    return;
  }
  state.view = "compact";
  root.dataset.view = "compact";
  void api.resize(state.compactWidth, state.compactHeight, { persist: false });
  updateCompactScale();
}

function updateStyleLabel() {
  state.style = normalizeStyle(state.style);
  const presentation = MODE_STYLE_PRESENTATION[state.mode]
    ?? MODE_STYLE_PRESENTATION.enhance;
  currentStyleLabel.textContent = presentation[state.style]?.label
    ?? STYLE_LABELS[state.style]
    ?? STYLE_LABELS.concise;
  document.querySelectorAll(".style-option").forEach((button) => {
    const item = presentation[button.dataset.style];
    if (item) {
      button.querySelector("strong").textContent = item.label;
      button.querySelector("span").textContent = item.description;
    }
    const selected = button.dataset.style === state.style;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  updateHubSummary();
}

function systemPromptEntryKey(mode, style) {
  return `${mode}:${style}`;
}

function findSystemPromptEntry(mode = state.systemPromptMode, style = state.systemPromptStyle) {
  return state.systemPrompts.find((entry) => entry?.mode === mode && entry?.style === style);
}

function renderSystemPromptPanel() {
  if (!systemPromptPanel || !systemPromptModeSelect || !systemPromptDefault
    || !systemPromptEffective || !systemPromptCustom) {
    return;
  }
  const presentation = MODE_STYLE_PRESENTATION[state.systemPromptMode]
    ?? MODE_STYLE_PRESENTATION.enhance;
  systemPromptModeSelect.value = state.systemPromptMode;
  document.querySelectorAll("[data-system-style]").forEach((button) => {
    const style = button.dataset.systemStyle;
    const item = presentation[style] ?? MODE_STYLE_PRESENTATION.enhance[style];
    const selected = style === state.systemPromptStyle;
    const heading = button.querySelector("strong");
    const description = button.querySelector("small");
    if (heading) {
      heading.textContent = item?.label ?? style;
    }
    if (description) {
      description.textContent = item?.description ?? "";
    }
    button.setAttribute("aria-selected", String(selected));
    button.classList.toggle("is-active", selected);
  });
  const entry = findSystemPromptEntry();
  if (!entry) {
    systemPromptDefault.value = "正在读取当前档位的默认系统提示词…";
    systemPromptEffective.value = "";
    if (!state.systemPromptDirty) {
      systemPromptCustom.value = "";
    }
    systemPromptStatus.textContent = "暂时无法读取系统提示词，请稍后重试。";
    saveSystemPromptButton.disabled = true;
    resetSystemPromptButton.disabled = true;
    return;
  }
  systemPromptDefault.value = entry.defaultPrompt ?? "";
  systemPromptEffective.value = entry.effectivePrompt ?? entry.defaultPrompt ?? "";
  if (!state.systemPromptDirty) {
    systemPromptCustom.value = entry.customPrompt ?? "";
  }
  saveSystemPromptButton.disabled = !state.systemPromptDirty;
  resetSystemPromptButton.disabled = !state.systemPromptDirty && !entry.customPrompt;
  systemPromptStatus.textContent = state.systemPromptDirty
    ? "已修改但尚未保存；保存后仅影响本机当前用户。"
    : entry.customPrompt
      ? "当前档位已使用本机自定义补充规则。"
      : "当前使用默认系统提示词。";
}

async function loadSystemPrompts() {
  if (typeof api?.getSystemPrompts !== "function") {
    return;
  }
  const result = await api.getSystemPrompts();
  state.systemPrompts = Array.isArray(result?.entries) ? result.entries : [];
  renderSystemPromptPanel();
}

function openSystemPromptPanel() {
  state.systemPromptMode = state.mode;
  state.systemPromptStyle = state.style;
  state.systemPromptDirty = false;
  showPanel(systemPromptPanel);
  renderSystemPromptPanel();
  if (!state.systemPrompts.length) {
    systemPromptStatus.textContent = "正在读取当前档位…";
    void loadSystemPrompts().catch((error) => {
      systemPromptStatus.textContent = errorMessage(error, "系统提示词读取失败，请稍后重试。" );
    });
  }
}

function selectSystemPrompt(mode, style) {
  if (state.systemPromptDirty) {
    systemPromptStatus.textContent = "请先保存或恢复当前编辑，再切换场景或优化档位。";
    renderSystemPromptPanel();
    return;
  }
  state.systemPromptMode = mode;
  state.systemPromptStyle = style;
  renderSystemPromptPanel();
}

async function handleSaveSystemPrompt() {
  const entry = findSystemPromptEntry();
  if (!entry || typeof api?.saveSystemPrompt !== "function") {
    return;
  }
  saveSystemPromptButton.disabled = true;
  systemPromptStatus.textContent = "正在保存本机自定义规则…";
  try {
    const saved = await api.saveSystemPrompt({
      mode: state.systemPromptMode,
      style: state.systemPromptStyle,
      customPrompt: systemPromptCustom.value,
    });
    state.systemPrompts = state.systemPrompts.map((item) => (
      item?.mode === saved?.mode && item?.style === saved?.style ? saved : item
    ));
    state.systemPromptDirty = false;
    renderSystemPromptPanel();
    systemPromptStatus.textContent = saved?.customPrompt
      ? "已保存；这条规则只会作用于本机当前用户和该模式×档位。"
      : "已恢复默认；这条档位不再使用自定义规则。";
  } catch (error) {
    renderSystemPromptPanel();
    systemPromptStatus.textContent = errorMessage(error, "系统提示词保存失败，请稍后重试。" );
  }
}

async function handleResetSystemPrompt() {
  if (typeof api?.resetSystemPrompt !== "function") {
    return;
  }
  resetSystemPromptButton.disabled = true;
  systemPromptStatus.textContent = "正在恢复默认规则…";
  try {
    const reset = await api.resetSystemPrompt({
      mode: state.systemPromptMode,
      style: state.systemPromptStyle,
    });
    state.systemPrompts = state.systemPrompts.map((item) => (
      item?.mode === reset?.mode && item?.style === reset?.style ? reset : item
    ));
    state.systemPromptDirty = false;
    renderSystemPromptPanel();
    systemPromptStatus.textContent = "已恢复默认系统提示词。";
  } catch (error) {
    renderSystemPromptPanel();
    systemPromptStatus.textContent = errorMessage(error, "默认规则恢复失败，请稍后重试。" );
  }
}

function updateModeLabel() {
  const presentation = MODE_PRESENTATION[state.mode] ?? MODE_PRESENTATION.enhance;
  root.dataset.mode = state.mode;
  petActionTitle.textContent = presentation.action;
  compactModeBadge.textContent = presentation.badge;
  compactModeBadge.setAttribute("aria-label", "当前场景：" + (MODE_LABELS[state.mode] ?? MODE_LABELS.enhance));
  updateStyleLabel();
  updateHubSummary();
}

function updateShortcutPresentation() {
  const activeLabel = shortcutDisplayLabel(state.shortcut);
  const draftLabel = shortcutDisplayLabel(state.shortcutDraft);
  currentShortcutLabel.textContent = activeLabel;
  helpShortcutLabel.textContent = activeLabel;
  shortcutValue.value = draftLabel;
  shortcutCaptureButton.textContent = state.shortcutRecording
    ? "请按下新的组合键…"
    : "录制新的组合键";
  shortcutCaptureButton.setAttribute("aria-pressed", String(state.shortcutRecording));
  shortcutPanel.classList.toggle("is-recording", state.shortcutRecording);
  shortcutSaveButton.disabled = state.shortcutRecording || state.shortcutDraft === state.shortcut;
  shortcutResetButton.disabled = state.shortcutRecording
    || (state.shortcut === DEFAULT_SHORTCUT && state.shortcutDraft === DEFAULT_SHORTCUT);
}

function openShortcutPanel() {
  state.shortcutDraft = state.shortcut;
  state.shortcutRecording = false;
  updateShortcutPresentation();
  shortcutStatus.textContent = `当前已启用：${shortcutDisplayLabel(state.shortcut)}。`;
  showPanel(shortcutPanel);
}

function beginShortcutCapture() {
  state.shortcutRecording = true;
  shortcutStatus.textContent = "正在录制：请按下至少两个修饰键和一个主按键。";
  updateShortcutPresentation();
}

function shortcutFromKeyboardEvent(event) {
  const modifiers = [];
  if (event.ctrlKey) {
    modifiers.push("Control");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }
  if (event.metaKey) {
    modifiers.push("Super");
  }

  const code = String(event.code ?? "");
  let baseKey = "";
  if (/^Key[A-Z]$/u.test(code)) {
    baseKey = code.slice(3);
  } else if (/^Digit[0-9]$/u.test(code)) {
    baseKey = code.slice(5);
  } else if (code === "Space") {
    baseKey = "Space";
  } else if (/^F(?:[1-9]|1[0-2])$/u.test(code)) {
    baseKey = code;
  }
  return normalizeShortcut([...modifiers, baseKey].filter(Boolean).join("+"), {
    fallbackToDefault: false,
  });
}

function handleShortcutKeydown(event) {
  if (!state.shortcutRecording) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    state.shortcutRecording = false;
    state.shortcutDraft = state.shortcut;
    shortcutStatus.textContent = "已取消录制，当前快捷键未改变。";
    updateShortcutPresentation();
    return true;
  }
  if (event.repeat || ["Control", "Alt", "Shift", "Meta"].includes(event.key)) {
    shortcutStatus.textContent = "继续按住修饰键，再按一个字母、数字、Space 或 F1–F12。";
    return true;
  }
  try {
    state.shortcutDraft = shortcutFromKeyboardEvent(event);
    state.shortcutRecording = false;
    shortcutStatus.textContent = `已录制：${shortcutDisplayLabel(state.shortcutDraft)}。点击“保存并启用”后生效。`;
  } catch (error) {
    shortcutStatus.textContent = errorMessage(error, "这个组合键不受支持，请重新录制。");
  }
  updateShortcutPresentation();
  return true;
}

async function applyShortcut(shortcut) {
  shortcutCaptureButton.disabled = true;
  shortcutResetButton.disabled = true;
  shortcutSaveButton.disabled = true;
  shortcutStatus.textContent = "正在检查占用并启用快捷键…";
  try {
    const result = await withOperationDeadline(api.setShortcut(shortcut), {
      stage: "shortcut",
      timeoutMs: CONFIGURE_STAGE_TIMEOUT_MS,
    });
    state.shortcut = normalizeShortcut(result?.shortcut ?? shortcut, {
      fallbackToDefault: false,
    });
    state.shortcutDraft = state.shortcut;
    state.shortcutRecording = false;
    shortcutStatus.textContent = result?.warning
      ? String(result.warning)
      : `已启用：${shortcutDisplayLabel(state.shortcut)}。`;
    setStatus("success", `全局快捷键已更新为“${shortcutDisplayLabel(state.shortcut)}”。`);
  } catch (error) {
    state.shortcutRecording = false;
    shortcutStatus.textContent = errorMessage(error, "快捷键设置失败，原快捷键仍然有效。");
  } finally {
    shortcutCaptureButton.disabled = false;
    updateShortcutPresentation();
  }
}

function setMascot(mascot, { persist = true } = {}) {
  const normalized = normalizeMascot(mascot);
  const presentation = MASCOTS[normalized];
  state.mascot = normalized;
  root.dataset.mascot = normalized;
  currentMascotLabel.textContent = presentation.label;
  petAvatar.setAttribute("aria-label", `${presentation.label}：一键处理当前输入`);
  const usesCssSprite = presentation.kind === "css";
  mascotImageFrame.hidden = usesCssSprite;
  mascotSprite.hidden = !usesCssSprite;
  profileMascotImage.hidden = usesCssSprite;
  profileMascotFallback.hidden = !usesCssSprite;
  if (!usesCssSprite && mascotImage.getAttribute("src") !== presentation.asset) {
    mascotImage.setAttribute("src", presentation.asset);
  }
  if (!usesCssSprite && profileMascotImage.getAttribute("src") !== presentation.asset) {
    profileMascotImage.setAttribute("src", presentation.asset);
  }
  document.querySelectorAll(".mascot-option").forEach((button) => {
    const selected = button.dataset.mascot === normalized;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  if (persist) {
    persistMascot(normalized);
  }
  updateHubSummary();
}

function updateReviewModeLabel() {
  reviewModeLabel.textContent = state.reviewMode ? "已开启" : "已关闭";
  reviewModeButton.setAttribute("aria-checked", String(state.reviewMode));
  reviewModeButton.classList.toggle("is-active", state.reviewMode);
  if (hubReviewQuick) {
    hubReviewQuick.setAttribute("aria-checked", String(state.reviewMode));
    hubReviewQuick.classList.toggle("is-active", state.reviewMode);
  }
  updateHubSummary();
}

function updateStartupLabel() {
  startupLabel.textContent = state.startup ? "已开启" : "已关闭";
  updateHubSummary();
}

function updateHubSummary() {
  const modeLabel = MODE_LABELS[state.mode] ?? MODE_LABELS.enhance;
  const styleLabel = MODE_STYLE_PRESENTATION[state.mode]?.[state.style]?.label
    ?? STYLE_LABELS[state.style]
    ?? STYLE_LABELS.concise;
  const reviewLabel = state.reviewMode ? "审阅后应用" : "直接回填";
  const mascotLabel = MASCOTS[state.mascot]?.label ?? MASCOTS.cockapoo.label;
  const startupText = state.startup ? "已开启" : "已关闭";
  if (hubModeValue) {
    hubModeValue.textContent = modeLabel;
  }
  if (hubStyleValue) {
    hubStyleValue.textContent = styleLabel;
  }
  if (hubReviewValue) {
    hubReviewValue.textContent = reviewLabel;
  }
  if (hubMascotValue) {
    hubMascotValue.textContent = `小精灵：${mascotLabel}`;
  }
  if (hubStartupValue) {
    hubStartupValue.textContent = `开机自启动：${startupText}`;
  }
  document.querySelectorAll("[data-hub-mode]").forEach((button) => {
    const selected = button.dataset.hubMode === state.mode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  updateHubOperationState();
}

function updateHubOperationState() {
  if (!hubPrimaryAction
    || !hubPrimaryActionTitle
    || !hubPrimaryActionHint
    || !hubPrivacyNote
    || !hubTaskState) {
    return;
  }
  const modeLabel = MODE_LABELS[state.mode] ?? MODE_LABELS.enhance;
  const styleLabel = MODE_STYLE_PRESENTATION[state.mode]?.[state.style]?.label
    ?? STYLE_LABELS[state.style]
    ?? STYLE_LABELS.concise;
  const pendingReview = hasPendingReview();
  const phaseLabels = {
    idle: "就绪",
    loading: "处理中",
    success: pendingReview ? "待审阅" : "已完成",
    error: "需处理",
  };
  hubTaskState.textContent = phaseLabels[state.phase] ?? phaseLabels.idle;
  hubTaskState.dataset.state = state.phase;
  hubPrimaryAction.disabled = state.phase === "loading";
  hubPrimaryAction.setAttribute("aria-busy", String(state.phase === "loading"));
  hubPrimaryActionTitle.textContent = state.phase === "loading"
    ? "正在优化…"
    : pendingReview
      ? "继续审阅"
      : state.phase === "error"
        ? "重试当前输入"
        : state.phase === "success"
          ? "继续优化当前输入"
          : "优化当前输入";
  hubPrimaryActionHint.textContent = state.phase === "loading"
    ? "原文保持不变，请稍候"
    : pendingReview
      ? "返回本次结果，不会重新生成"
      : `${modeLabel} · ${styleLabel}`;
  hubPrivacyNote.textContent = state.reviewMode
    ? "只处理当前输入 · 不保存表达历史 · 先审阅再决定回填"
    : "只处理当前输入 · 不保存表达历史 · 通过校验后安全回填";
}

function hasPendingReview() {
  return state.reviewMode
    && state.enhancedText.trim().length > 0
    && !state.replacementConfirmed;
}

function updateModelStorageLabel() {
  if (state.modelConfigDirty) {
    modelStorageStatus.textContent = "配置已修改，保存或检查后生效。";
    modelStorageStatus.dataset.state = "pending";
    if (hubModelStateLabel) {
      hubModelStateLabel.textContent = "待保存";
    }
  } else if (state.apiKeySaved) {
    modelStorageStatus.textContent = "API Key 已加密保存，可留空复用；不会显示明文。";
    modelStorageStatus.dataset.state = "saved";
    apiKeyInput.placeholder = "已保存，可留空不修改";
    if (hubModelStateLabel) {
      hubModelStateLabel.textContent = "已配置";
    }
  } else if (state.storageAvailable) {
    modelStorageStatus.textContent = "填写 API Key 后点击保存配置，将使用 Windows 加密存储。";
    modelStorageStatus.dataset.state = "pending";
    apiKeyInput.placeholder = "请输入你的 API Key";
    if (hubModelStateLabel) {
      hubModelStateLabel.textContent = "待配置";
    }
  } else {
    modelStorageStatus.textContent = "当前系统无法启用加密存储，Key 只能保存在本次运行内存中。";
    modelStorageStatus.dataset.state = "warning";
    apiKeyInput.placeholder = "请输入本次运行使用的 API Key";
    if (hubModelStateLabel) {
      hubModelStateLabel.textContent = "仅本次";
    }
  }
}

function updateModelConnectionLabel() {
  if (!hubModelCheckLabel) {
    return;
  }
  const labels = {
    unchecked: "未检查",
    checking: "检查中",
    connected: "已连接",
    error: "检查失败",
  };
  hubModelCheckLabel.textContent = labels[state.modelConnection] ?? labels.unchecked;
  hubModelCheckLabel.dataset.state = state.modelConnection;
}

function makeRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return "prompt-lift-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function isCurrentRequest(requestId) {
  return state.requestId === requestId && !state.cancelled;
}

function clarificationQuestion(error) {
  const question = error?.details?.question;
  if (typeof question === "string" && question.trim()) {
    return question.trim().slice(0, 240);
  }
  return "";
}

function clarificationItems(error) {
  const details = error?.details ?? {};
  const rawItems = Array.isArray(details.questions)
    ? details.questions
    : Array.isArray(details.missingFields)
      ? details.missingFields.map((field) => `请补充：${String(field)}`)
      : [details.question];
  return rawItems
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim().slice(0, 240))
    .slice(0, 3);
}

function showNeedsInput(error) {
  const items = clarificationItems(error);
  if (items.length === 0) {
    items.push("请补充任务对象或必要上下文。");
  }
  missingFields.replaceChildren(...items.map((item) => {
    const row = document.createElement("li");
    row.textContent = item;
    return row;
  }));
  clarificationInput.value = "";
  needsInputPanel.hidden = false;
  expandAssistant();
  requestAnimationFrame(() => clarificationInput.focus());
}

function hideNeedsInput() {
  needsInputPanel.hidden = true;
  missingFields.replaceChildren();
  clarificationInput.value = "";
}

function errorMessage(error, fallback = messages.error) {
  switch (inferErrorCode(error)) {
    case "API_UNAVAILABLE":
      return "助手连接失败，请重启 Prompt Pet 后重试。";
    case "API_KEY_REQUIRED":
      return "请先在右键菜单中配置 API Key；已保存的 Key 可留空直接复用。";
    case "API_KEY_STORAGE_UNAVAILABLE":
      return "当前系统无法启用加密存储，Key 只能保存在本次运行内存中。";
    case "API_KEY_STORAGE_FAILED":
      return "模型可继续使用，但 API Key 未能保存，请检查应用数据目录权限后重试。";
    case "AUTH_ERROR":
      return "API Key 无效，或当前 Key 没有该模型的访问权限。";
    case "MODEL_CONFIG_INVALID":
    case "INVALID_ENDPOINT":
      return "模型配置无效，请检查 API Base URL、模型名和 Key。";
    case "MODEL_REQUIRED":
      return "请填写模型名称。";
    case "STYLE_INVALID":
      return "提示词风格无效，请重新选择。";
    case "MODE_INVALID":
      return "场景无效，请重新选择。";
    case "SHORTCUT_INVALID":
      return "快捷键无效；请选择双击左 Alt，或至少包含两个修饰键的组合键。";
    case "SHORTCUT_CONFLICT":
      return "这个快捷键已被其他应用占用，原快捷键仍然有效。";
    case "SHORTCUT_UNAVAILABLE":
      return "快捷键监听暂不可用，原快捷键仍然有效。";
    case "SHORTCUT_SAVE_FAILED":
      return "快捷键未能保存，原快捷键仍然有效。";
    case "SYSTEM_PROMPT_SAVE_FAILED":
      return "系统提示词保存失败；默认规则仍会继续生效，请稍后重试。";
    case "WINDOW_SIZE_INVALID":
      return "窗口尺寸无效，请重新拖动右上角控制点。";
    case "NETWORK_ERROR":
      return "无法连接模型服务，请检查网络或 API Base URL。";
    case "HTTP_ERROR":
      return "模型服务请求失败，请稍后重试。";
    case "INVALID_JSON":
    case "MISSING_RESULT":
      return "模型返回格式无法识别，增强结果未回填。";
    case "INVALID_MODEL_OUTPUT":
    case "MODEL_OUTPUT_META_PROMPT":
    case "MODEL_OUTPUT_MODE_MISMATCH":
    case "MODEL_OUTPUT_LANGUAGE_MISMATCH":
    case "MODEL_OUTPUT_STATUS_MISMATCH":
    case "MODEL_OUTPUT_TRUNCATED":
    case "MODEL_OUTPUT_TOO_LONG":
    case "MODEL_OUTPUT_FACT_LOSS":
    case "MODEL_OUTPUT_SCOPE_INVENTION":
    case "MODEL_OUTPUT_MULTIPLE_CANDIDATES":
    case "MODEL_OUTPUT_SEMANTIC_ESCALATION":
      return "模型结果未通过安全校验，原文未被覆盖；请重试或切换“原意守护”。";
    case "MODEL_NEEDS_INPUT":
      return clarificationQuestion(error)
        || "原始内容信息不足，请补充任务对象或必要上下文后重试。";
    case "BRIDGE_TIMEOUT":
      return "读取目标窗口超时，原始输入框未被覆盖。";
    case "OPERATION_TIMEOUT":
      return "处理超时并已自动结束，请检查网络或模型配置后重试；原输入框未被覆盖。";
    case "TARGET_REQUIRED":
    case "TARGET_INVALID":
    case "WINDOW_NOT_FOUND":
      return "找不到目标输入框，请重新聚焦聊天输入框后再触发。";
    case "TARGET_PATTERN_MISMATCH":
      return "当前窗口与设置的标题关键词不匹配，请重新聚焦正确窗口。";
    case "TARGET_CONTENT_CHANGED":
      return "等待期间输入框内容已经变化，已取消回填以保护你的新内容。";
    case "REPLACEMENT_CANCELLED":
      return "本次操作已取消或失效，原始输入框未被覆盖。";
    case "REPLACEMENT_EXPIRED":
      return "本次操作已过期，请重新读取输入框后再试；原始内容未被覆盖。";
    case "CLIPBOARD_UNAVAILABLE":
    case "CLIPBOARD_RESTORE_FAILED":
      return "剪贴板暂不可用，请关闭占用剪贴板的程序后重试。";
    case "REPLACE_NOT_CONFIRMED":
      return "自动回填未能可靠确认。请检查聊天输入框；增强结果已保留，可复制后手动粘贴。";
    case "POWERSHELL_START_FAILED":
    case "POWERSHELL_FAILED":
      return "Windows 桥接失败，请确认目标应用运行在桌面环境。";
    case "EMPTY_PROMPT":
      return "当前输入框为空，请先输入提示词。";
    case "PROMPT_NOT_CAPTURED":
      return "没有读到目标输入框，请先聚焦 Codex 或 Claude 的输入框。";
    case "EMPTY_RESULT":
      return "模型没有返回可用内容，原文未被覆盖。";
    case "CANCELLED":
      return "已取消，原始输入框未被覆盖。";
    default: {
      const detail = typeof error?.message === "string"
        ? error.message
          .replace(/^Error invoking remote method '[^']+':\s*/u, "")
          .replace(/^Error:\s*/u, "")
          .trim()
        : "";
      if (/target input changed after capture/i.test(detail)) {
        return "等待期间目标输入框内容已变化，已取消回填以保护你的新内容。";
      }
      if (/target window (?:did not receive focus|could not be activated)/i.test(detail)) {
        return "无法重新聚焦目标聊天窗口，请先点击聊天输入框后重试。";
      }
      if (/api key is invalid|not allowed to use this model/i.test(detail)) {
        return "API Key 无效或没有该模型的访问权限，请在右键菜单中检查并保存。";
      }
      return detail && detail.length <= 180 ? `${fallback}（${detail}）` : fallback;
    }
  }
}

function inferErrorCode(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code && code !== "PROMPT_LIFT_ERROR") {
    return code;
  }
  const detail = typeof error?.message === "string" ? error.message : "";
  const serializedStableCode = detail.match(/\b(MODEL_NEEDS_INPUT)\b/u)?.[1];
  if (serializedStableCode) {
    return serializedStableCode;
  }
  if (/missing (?:a )?result,?\s*(?:text|or content)|响应缺少\s*result[、,，]?\s*text/iu.test(detail)) {
    return "MISSING_RESULT";
  }
  if (/invalid (?:prompt )?work mode|提示词工作模式无效|工作模式无效/iu.test(detail)) {
    return "MODE_INVALID";
  }
  return code;
}

function assertApi() {
  if (!api
    || typeof api.capture !== "function"
    || typeof api.enhance !== "function"
    || typeof api.configure !== "function"
    || typeof api.getModelConfig !== "function"
    || typeof api.getSystemPrompts !== "function"
    || typeof api.saveSystemPrompt !== "function"
    || typeof api.resetSystemPrompt !== "function"
    || typeof api.getShortcut !== "function"
    || typeof api.setShortcut !== "function"
    || typeof api.setMode !== "function"
    || typeof api.startDrag !== "function"
    || typeof api.updateDrag !== "function"
    || typeof api.endDrag !== "function"
    || typeof api.resize !== "function") {
    const error = new Error("Prompt Pet preload API is unavailable");
    error.code = "API_UNAVAILABLE";
    throw error;
  }
}

function showPanel(panel) {
  expandAssistant();
  if (panel !== shortcutPanel && state.shortcutRecording) {
    state.shortcutRecording = false;
    state.shortcutDraft = state.shortcut;
    updateShortcutPresentation();
  }
  root.dataset.surface = "panel";
  contextMenu.hidden = true;
  settingsPanel.hidden = panel !== settingsPanel;
  stylePanel.hidden = panel !== stylePanel;
  systemPromptPanel.hidden = panel !== systemPromptPanel;
  mascotPanel.hidden = panel !== mascotPanel;
  shortcutPanel.hidden = panel !== shortcutPanel;
  helpPanel.hidden = panel !== helpPanel;
  requestAnimationFrame(() => {
    panel.scrollIntoView({ block: "nearest" });
  });
}

function showHub(hub = state.hub) {
  const normalizedHub = HUB_LABELS[hub] ? hub : "process";
  state.hub = normalizedHub;
  if (state.shortcutRecording) {
    state.shortcutRecording = false;
    state.shortcutDraft = state.shortcut;
    updateShortcutPresentation();
  }
  expandAssistant();
  root.dataset.surface = "hub";
  contextMenu.hidden = false;
  settingsPanel.hidden = true;
  stylePanel.hidden = true;
  systemPromptPanel.hidden = true;
  mascotPanel.hidden = true;
  shortcutPanel.hidden = true;
  helpPanel.hidden = true;
  hubHeading.textContent = HUB_LABELS[normalizedHub];
  document.querySelectorAll("[data-hub-page]").forEach((page) => {
    page.hidden = page.dataset.hubPage !== normalizedHub;
  });
  document.querySelectorAll("[data-hub-target]").forEach((tab) => {
    const selected = tab.dataset.hubTarget === normalizedHub;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  requestAnimationFrame(() => {
    contextMenu.scrollIntoView({ block: "nearest" });
  });
}

function showContextMenu() {
  showHub(state.hub);
}

function focusSceneSelector() {
  showHub("process");
  requestAnimationFrame(() => {
    hubSceneSelector?.scrollIntoView({ block: "center", behavior: "smooth" });
    const activeScene = hubSceneSelector?.querySelector(".hub-scene-choice.is-active")
      ?? hubSceneSelector?.querySelector(".hub-scene-choice");
    activeScene?.focus({ preventScroll: true });
  });
}

function hidePanels({ collapse = true } = {}) {
  if (state.shortcutRecording) {
    state.shortcutRecording = false;
    state.shortcutDraft = state.shortcut;
    updateShortcutPresentation();
  }
  root.dataset.surface = "task";
  contextMenu.hidden = true;
  settingsPanel.hidden = true;
  stylePanel.hidden = true;
  systemPromptPanel.hidden = true;
  mascotPanel.hidden = true;
  shortcutPanel.hidden = true;
  helpPanel.hidden = true;
  if (collapse) {
    collapseAssistant();
  }
}

function toggleWorkMode() {
  const modeOrder = Object.keys(MODE_LABELS);
  const currentIndex = modeOrder.indexOf(state.mode);
  const nextMode = modeOrder[(currentIndex + 1) % modeOrder.length];
  return handleMode(nextMode);
}

function unpackCapture(result) {
  return normalizeCapturedPrompt(result);
}

function unpackEnhancement(result) {
  const text = typeof result === "string"
    ? result
    : result?.text ?? result?.enhancedText ?? result?.enhanced ?? result?.prompt ?? "";
  return {
    text: typeof text === "string" ? text : "",
    replaced: result?.replaced !== false,
  };
}

function renderDiff() {
  originalPreview.textContent = state.originalText;
  diffPreview.replaceChildren();

  const original = state.originalText;
  const revised = enhancedPrompt.value;
  let prefixLength = 0;
  const sharedLimit = Math.min(original.length, revised.length);
  while (prefixLength < sharedLimit && original[prefixLength] === revised[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < sharedLimit - prefixLength
    && original[original.length - 1 - suffixLength] === revised[revised.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const prefix = original.slice(0, prefixLength);
  const removed = original.slice(prefixLength, original.length - suffixLength);
  const inserted = revised.slice(prefixLength, revised.length - suffixLength);
  const suffix = suffixLength > 0 ? original.slice(original.length - suffixLength) : "";
  if (prefix) {
    diffPreview.append(document.createTextNode(prefix));
  }
  if (removed) {
    const deletion = document.createElement("del");
    deletion.textContent = removed;
    diffPreview.append(deletion);
  }
  if (inserted) {
    const insertion = document.createElement("ins");
    insertion.textContent = inserted;
    diffPreview.append(insertion);
  }
  if (suffix) {
    diffPreview.append(document.createTextNode(suffix));
  }
  if (!removed && !inserted) {
    diffPreview.textContent = "内容未变化";
  }
}

function acceptCapturedPayload(payload) {
  const captured = unpackCapture(payload);
  state.originalText = captured.text.slice(0, MAX_PROMPT_LENGTH);
  state.target = captured.target;
  state.enhancedText = "";
  state.replacementConfirmed = false;
  state.appliedText = "";
  state.generationOperationId = undefined;
  state.validatedText = "";
  enhancedPrompt.value = "";
  hideNeedsInput();
  renderDiff();
  resultPanel.hidden = true;
  sourceInfo.hidden = false;
  updateMeta();
  return { ...captured, text: state.originalText };
}

function rejectPendingCapture(error) {
  if (!pendingCapture) {
    return false;
  }
  const current = pendingCapture;
  pendingCapture = undefined;
  clearTimeout(current.timer);
  current.reject(error);
  return true;
}

function resolvePendingCapture(payload) {
  if (!pendingCapture) {
    return false;
  }
  const current = pendingCapture;
  pendingCapture = undefined;
  clearTimeout(current.timer);
  current.resolve(payload);
  return true;
}

async function requestCapture() {
  const titlePattern = targetWindowTitlePattern.value.trim();
  if (typeof api.onCaptured !== "function") {
    return acceptCapturedPayload(await api.capture(titlePattern));
  }

  const payload = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingCapture?.timer === timer) {
        pendingCapture = undefined;
        const error = new Error("Capture timed out");
        error.code = "BRIDGE_TIMEOUT";
        reject(error);
      }
    }, 12_000);

    pendingCapture = { resolve, reject, timer };
    Promise.resolve(api.capture(titlePattern))
      .catch((error) => {
        rejectPendingCapture(error);
      })
      .then((result) => {
        if (result !== undefined) {
          resolvePendingCapture(result);
        }
      });
  });
  return acceptCapturedPayload(payload);
}

async function configureModel() {
  const result = await api.configure({
    endpoint: modelEndpoint.value.trim(),
    model: modelName.value.trim(),
    apiKey: apiKeyInput.value,
    style: state.style,
    targetWindowTitlePattern: targetWindowTitlePattern.value.trim(),
  });
  state.modelConfigDirty = false;
  apiKeyInput.value = "";
  if (result?.style) {
    state.style = normalizeStyle(result.style);
    updateStyleLabel();
  }
  if (typeof result?.apiKeySaved === "boolean") {
    state.apiKeySaved = result.apiKeySaved;
  }
  if (typeof result?.storageAvailable === "boolean") {
    state.storageAvailable = result.storageAvailable;
  }
  updateModelStorageLabel();
  return result;
}

async function captureSource() {
  const captured = await requestCapture();
  if (!hasVisiblePromptText(captured.text)) {
    const error = new Error("The target prompt is empty");
    error.code = "EMPTY_PROMPT";
    throw error;
  }
  return captured.text;
}

async function handleEnhance({ capturedSource, clarification } = {}) {
  if (state.requestId) {
    return;
  }

  assertApi();
  let expectedTargetText = state.replacementConfirmed
    ? state.appliedText
    : state.originalText;
  hidePanels();
  hideNeedsInput();
  const requestId = makeRequestId();
  const generationMode = state.mode;
  const generationStyle = state.style;
  state.requestId = requestId;
  state.cancelled = false;
  state.enhancedText = "";
  state.replacementConfirmed = false;
  state.appliedText = "";
  state.generationOperationId = undefined;
  state.validatedText = "";
  state.resultMode = undefined;
  state.resultStyle = undefined;
  enhancedPrompt.value = "";
  resultPanel.hidden = true;
  updateMeta();
  setStatus("loading");

  try {
    await withOperationDeadline(api.setMode(state.mode), {
      stage: "mode",
      timeoutMs: MODE_STAGE_TIMEOUT_MS,
    });
    await withOperationDeadline(configureModel(), {
      stage: "configure",
      timeoutMs: CONFIGURE_STAGE_TIMEOUT_MS,
    });
    const sourceText = capturedSource?.text ?? await captureSource();
    if (capturedSource === undefined) {
      expectedTargetText = state.originalText;
    }
    if (!isCurrentRequest(requestId)) {
      return;
    }

    const result = await withOperationDeadline(api.enhance({
      requestId,
      prompt: sourceText,
      clarification,
      target: state.target,
      replace: !state.reviewMode,
    }), {
      stage: "model",
      timeoutMs: MODEL_STAGE_TIMEOUT_MS,
    });
    if (!isCurrentRequest(requestId)) {
      return;
    }

    const enhanced = unpackEnhancement(result);
    if (!hasVisiblePromptText(enhanced.text)) {
      const error = new Error("The enhancer returned an empty result");
      error.code = "EMPTY_RESULT";
      throw error;
    }
    state.enhancedText = enhanced.text.slice(0, MAX_PROMPT_LENGTH);
    state.generationOperationId = requestId;
    state.validatedText = state.enhancedText;
    state.resultMode = generationMode;
    state.resultStyle = generationStyle;
    enhancedPrompt.value = state.enhancedText;
    renderDiff();
    updateMeta();
    if (state.reviewMode) {
      resultPanel.hidden = false;
      expandAssistant();
    } else {
      collapseAssistant();
      resultPanel.hidden = false;
    }

    if (enhanced.replaced) {
      try {
        if (!isCurrentRequest(requestId)) {
          return;
        }
        state.applying = true;
        setStatus("loading", "模型结果已通过校验，正在安全回填…");
        await withOperationDeadline(api.apply(enhanced.text, state.target, {
          expectedText: expectedTargetText || state.originalText,
          operationId: requestId,
        }), {
          stage: "apply",
          timeoutMs: APPLY_STAGE_TIMEOUT_MS,
        });
        state.replacementConfirmed = true;
        state.appliedText = enhanced.text;
      } finally {
        state.applying = false;
      }
    }

    const successCopy = (MODE_PRESENTATION[state.mode] ?? MODE_PRESENTATION.enhance).success;
    setStatus(
      "success",
      state.reviewMode ? `${successCopy} 请审阅后应用。` : `${successCopy} 结果已安全回填。`,
    );
  } catch (error) {
    if (!isCurrentRequest(requestId)) {
      return;
    }
    if (error?.code === "OPERATION_TIMEOUT" && typeof api?.cancel === "function") {
      void api.cancel(requestId).catch(() => {});
    }
    state.applying = false;
    state.replacementConfirmed = false;
    state.appliedText = "";
    if (!state.enhancedText) {
      enhancedPrompt.value = "";
      resultPanel.hidden = true;
    } else {
      resultPanel.hidden = false;
    }
    expandAssistant();
    updateMeta();
    if (error?.code === "API_KEY_REQUIRED") {
      showPanel(settingsPanel);
      apiKeyInput.focus();
    }
    if (inferErrorCode(error) === "MODEL_NEEDS_INPUT") {
      showNeedsInput(error);
    }
    setStatus("error", errorMessage(error));
  } finally {
    if (state.requestId === requestId) {
      state.requestId = undefined;
    }
  }
}

async function handleApplyEdited() {
  const editedText = enhancedPrompt.value.trim();
  if (state.requestId || state.applying || !editedText || !state.generationOperationId) {
    return;
  }
  try {
    state.applying = true;
    setStatus("loading", "正在安全应用编辑后的结果…");
    await withOperationDeadline(api.apply(editedText, state.target, {
      expectedText: state.replacementConfirmed
        ? state.appliedText
        : state.originalText,
      operationId: state.generationOperationId,
    }), {
      stage: "apply",
      timeoutMs: APPLY_STAGE_TIMEOUT_MS,
    });
    state.enhancedText = editedText;
    state.appliedText = editedText;
    state.replacementConfirmed = true;
    renderDiff();
    setStatus("success", "编辑后的结果已安全应用，仍可恢复原文。");
  } catch (error) {
    setStatus("error", errorMessage(error, "编辑后的结果未应用，原文保持不变。"));
  } finally {
    state.applying = false;
    setStatus(state.phase, statusMessage.textContent);
  }
}

async function handleRegenerate() {
  if (state.requestId || !state.originalText.trim()) {
    return;
  }
  if (state.generationOperationId && typeof api?.cancel === "function") {
    await api.cancel(state.generationOperationId).catch(() => {});
  }
  await handleEnhance({
    capturedSource: { text: state.originalText, target: state.target },
  });
}

async function handleClarificationRegenerate() {
  const supplement = clarificationInput.value.trim();
  if (!supplement || state.requestId || !state.originalText.trim()) {
    clarificationInput.focus();
    return;
  }
  const previousReviewMode = state.reviewMode;
  state.reviewMode = true;
  updateReviewModeLabel();
  try {
    await handleEnhance({
      capturedSource: { text: state.originalText, target: state.target },
      clarification: supplement,
    });
  } finally {
    state.reviewMode = previousReviewMode;
    updateReviewModeLabel();
  }
}

function handleReviewModeToggle() {
  if (state.requestId) {
    setStatus("loading", "本次处理完成后再切换应用方式。");
    return;
  }
  state.reviewMode = !state.reviewMode;
  persistReviewMode(state.reviewMode);
  updateReviewModeLabel();
  setStatus(
    "success",
    state.reviewMode ? "已开启审阅模式：生成后确认再应用。" : "已开启极速模式：生成通过后自动回填。",
  );
}

async function handleSaveModel() {
  if (state.requestId) {
    setStatus("loading", "正在处理当前输入，完成后再修改模型配置。");
    return;
  }
  try {
    setStatus("loading", "正在保存模型配置…");
    await configureModel();
    setStatus("success", state.apiKeySaved
      ? "模型配置已保存，API Key 已加密保存，下次启动可直接使用。"
      : "模型配置已应用，但 API Key 未保存，只在本次运行内存中有效。");
  } catch (error) {
    setStatus("error", errorMessage(error, "模型配置保存失败，请检查输入内容。"));
  }
}

async function handleCheckModel() {
  if (state.requestId) {
    setStatus("loading", "正在处理当前输入，完成后再检查模型配置。");
    return;
  }
  state.modelConnection = "checking";
  updateModelConnectionLabel();
  try {
    setStatus("loading", "正在请求模型进行 Key 有效性检查…");
    const result = await api.checkModel({
      endpoint: modelEndpoint.value.trim(),
      model: modelName.value.trim(),
      apiKey: apiKeyInput.value,
      targetWindowTitlePattern: targetWindowTitlePattern.value.trim(),
    });
    await configureModel();
    state.modelConnection = "connected";
    updateModelConnectionLabel();
    setStatus("success", "模型 Key 有效，已连接并保存 "
      + (result?.model ?? modelName.value.trim()) + "。");
  } catch (error) {
    state.modelConnection = "error";
    updateModelConnectionLabel();
    setStatus("error", errorMessage(error, "模型检查失败，请检查 Key、模型和网络。"));
  }
}

async function handleStyle(style) {
  if (state.requestId) {
    setStatus("loading", "正在处理当前输入，本次使用的风格不会中途切换。");
    return;
  }
  try {
    const result = await api.setStyle(style);
    state.style = normalizeStyle(result?.style ?? style);
    updateStyleLabel();
    showContextMenu();
    setStatus("success", "提示词风格已切换为“"
      + (MODE_STYLE_PRESENTATION[state.mode]?.[state.style]?.label
        ?? STYLE_LABELS[state.style]
        ?? state.style) + "”。");
  } catch (error) {
    setStatus("error", errorMessage(error, "提示词风格保存失败。"));
  }
}

async function handleMode(mode, { returnToMenu = false } = {}) {
  if (state.requestId) {
    setStatus("loading", "正在处理当前输入，本次使用的场景不会中途切换。");
    return;
  }
  try {
    const result = await api.setMode(mode);
    state.mode = result?.mode ?? mode;
    updateModeLabel();
    if (returnToMenu) {
      showContextMenu();
    } else {
      hidePanels();
    }
    setStatus("success", "场景已切换为“"
      + (MODE_LABELS[state.mode] ?? state.mode) + "”。");
  } catch (error) {
    setStatus("error", errorMessage(error, "场景切换失败。"));
  }
}

async function handleStartupToggle() {
  if (state.requestId) {
    setStatus("loading", "正在处理当前输入，请稍后修改启动设置。");
    return;
  }
  try {
    const current = await api.getStartup();
    const result = await api.setStartup(!current.enabled);
    state.startup = result?.enabled === true;
    updateStartupLabel();
    setStatus("success", state.startup ? "已开启开机自启动。" : "已关闭开机自启动。");
  } catch (error) {
    setStatus("error", errorMessage(error, "开机自启动设置失败。"));
  }
}

async function handleCopy() {
  if (state.phase === "loading" || !enhancedPrompt.value.trim()) {
    return;
  }
  try {
    await api.copy(enhancedPrompt.value);
    setStatus("success", "优化结果已复制到剪贴板。");
  } catch (error) {
    setStatus("error", errorMessage(error, "复制失败，优化结果仍保留在助手中。"));
  }
}

async function handleRestore() {
  if (state.phase === "loading" || !state.originalText || !state.replacementConfirmed) {
    return;
  }
  try {
        await api.restore(state.originalText, state.target, {
          expectedText: state.appliedText || undefined,
          operationId: state.generationOperationId,
        });
    state.replacementConfirmed = false;
    state.enhancedText = "";
    state.appliedText = "";
    state.generationOperationId = undefined;
    state.validatedText = "";
    enhancedPrompt.value = "";
    renderDiff();
    resultPanel.hidden = true;
    updateMeta();
    setStatus("success", "已恢复原文，目标输入框内容未再被增强结果覆盖。");
  } catch (error) {
    setStatus("error", errorMessage(error, "恢复失败，原文仍保留在助手中。"));
  }
}

async function handleDiscardReview() {
  if (state.applying
    || !state.reviewMode
    || !state.enhancedText.trim()
    || state.replacementConfirmed) {
    return;
  }
  const operationId = state.generationOperationId;
  if (operationId && typeof api?.cancel === "function") {
    try {
      await api.cancel(operationId);
    } catch {
      // The model request may already be settled; local discard is still safe.
    }
  }
  state.enhancedText = "";
  state.appliedText = "";
  state.generationOperationId = undefined;
  state.validatedText = "";
  state.replacementConfirmed = false;
  enhancedPrompt.value = "";
  renderDiff();
  resultPanel.hidden = true;
  hideNeedsInput();
  updateMeta();
  collapseAssistant();
  setStatus("idle", "已放弃本次审阅，原始输入框保持不变。");
}

async function handleCancel() {
  if (state.phase !== "loading") {
    await handleDiscardReview();
    return;
  }
  if (state.applying) {
    setStatus("loading", "正在完成安全回填，此阶段无法中断，请稍候。");
    return;
  }
  const requestId = state.requestId;
  state.cancelled = true;
  state.requestId = undefined;
  const cancelled = new Error("Prompt enhancement cancelled");
  cancelled.code = "CANCELLED";
  rejectPendingCapture(cancelled);
  setStatus("idle", "已取消，原始输入框未被覆盖。");
  if (typeof api?.cancel === "function") {
    try {
      await api.cancel(requestId);
    } catch {
      // The request guard above prevents a late result from updating the UI.
    }
  }
}

function markModelChanged() {
  state.modelConfigDirty = true;
  state.modelConnection = "unchecked";
  updateModelStorageLabel();
  updateModelConnectionLabel();
  if (state.phase !== "loading") {
    statusMessage.textContent = "模型配置已修改，保存或检查后再增强。";
  }
}

function handleHubPrimaryAction() {
  if (hasPendingReview()) {
    hidePanels({ collapse: false });
    resultPanel.hidden = false;
    expandAssistant();
    enhancedPrompt.focus();
    return;
  }
  handleEnhance().catch((error) => setStatus("error", errorMessage(error)));
}

function scheduleResize(width, height) {
  resizeSession.pendingWidth = width;
  resizeSession.pendingHeight = height;
  if (resizeFrame) {
    return;
  }
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined;
    if (!resizeSession) {
      return;
    }
    void api.resize(resizeSession.pendingWidth, resizeSession.pendingHeight, {
      anchor: "top-right",
    });
  });
}

function beginAvatarDrag(event) {
  if (event.button !== 0) {
    return;
  }
  prepareTargetSnapshot();
  petAvatar.setPointerCapture(event.pointerId);
  api.startDrag(event.screenX, event.screenY);
  root.dataset.dragging = "false";
  dragSession = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    moved: false,
  };
}

function prepareTargetSnapshot() {
  if (targetSnapshotPromise) {
    return targetSnapshotPromise;
  }
  if (typeof api?.rememberTarget !== "function") {
    targetSnapshotPromise = Promise.resolve();
    return targetSnapshotPromise;
  }
  targetSnapshotPromise = api.rememberTarget().catch(() => undefined);
  return targetSnapshotPromise;
}

async function awaitTargetSnapshot() {
  const pendingSnapshot = targetSnapshotPromise;
  targetSnapshotPromise = undefined;
  await pendingSnapshot;
}

function moveAvatar(event) {
  if (!dragSession || event.pointerId !== dragSession.pointerId) {
    return;
  }
  if (!dragSession.moved
    && Math.hypot(event.screenX - dragSession.startX, event.screenY - dragSession.startY) < 5) {
    return;
  }
  dragSession.moved = true;
  root.dataset.dragging = "true";
  event.preventDefault();
  api.updateDrag(event.screenX, event.screenY);
}

function finishAvatarDrag(event) {
  if (!dragSession || event.pointerId !== dragSession.pointerId) {
    return;
  }
  api.endDrag(event.screenX, event.screenY);
  if (dragSession.moved) {
    suppressAvatarClickUntil = Date.now() + 250;
  }
  dragSession = undefined;
  root.dataset.dragging = "false";
  try {
    petAvatar.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already have been released by the browser.
  }
}

resizeHandle.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  resizeHandle.setPointerCapture(event.pointerId);
  resizeSession = {
    pointerId: event.pointerId,
    startX: event.screenX,
    startY: event.screenY,
    startWidth: window.outerWidth,
    startHeight: window.outerHeight,
    pendingWidth: window.outerWidth,
    pendingHeight: window.outerHeight,
    moved: false,
  };
  root.dataset.resizing = "true";
});
resizeHandle.addEventListener("pointermove", (event) => {
  if (!resizeSession || event.pointerId !== resizeSession.pointerId) {
    return;
  }
  if (Math.hypot(
    event.screenX - resizeSession.startX,
    event.screenY - resizeSession.startY,
  ) >= 5) {
    resizeSession.moved = true;
  }
  scheduleResize(
    resizeSession.startWidth + event.screenX - resizeSession.startX,
    resizeSession.startHeight - event.screenY + resizeSession.startY,
  );
});
function finishResize(event) {
  if (resizeSession?.pointerId === event.pointerId) {
    if (resizeSession.moved) {
      suppressMenuClickUntil = Date.now() + 250;
    }
    const finalWidth = Math.min(700, Math.max(MIN_COMPACT_WIDTH, resizeSession.pendingWidth));
    const finalHeight = Math.min(820, Math.max(MIN_COMPACT_HEIGHT, resizeSession.pendingHeight));
    void api.resize(finalWidth, finalHeight, { anchor: "top-right" });
    if (state.view === "compact") {
      state.compactWidth = finalWidth;
      state.compactHeight = finalHeight;
      persistCompactSize(finalWidth, finalHeight);
    }
    resizeSession = undefined;
    root.dataset.resizing = "false";
    updateCompactScale();
  }
}
resizeHandle.addEventListener("pointerup", finishResize);
resizeHandle.addEventListener("pointercancel", finishResize);
resizeHandle.addEventListener("click", () => {
  if (Date.now() < suppressMenuClickUntil) {
    return;
  }
  showContextMenu();
});
window.addEventListener("resize", updateCompactScale);

petAvatar.addEventListener("pointerenter", prepareTargetSnapshot);
petAvatar.addEventListener("pointerdown", beginAvatarDrag);
petAvatar.addEventListener("pointermove", moveAvatar);
petAvatar.addEventListener("pointerup", finishAvatarDrag);
petAvatar.addEventListener("pointercancel", finishAvatarDrag);
petAction.addEventListener("click", () => {
  handleEnhance().catch((error) => setStatus("error", errorMessage(error)));
});
hubPrimaryAction.addEventListener("click", () => {
  handleHubPrimaryAction();
});
petAvatar.addEventListener("click", () => {
  if (Date.now() < suppressAvatarClickUntil) {
    return;
  }
  awaitTargetSnapshot()
    .finally(() => handleEnhance())
    .catch((error) => setStatus("error", errorMessage(error)));
});
collapseButton.addEventListener("click", () => {
  hidePanels({ collapse: false });
  collapseAssistant();
});
closeButton.addEventListener("click", () => {
  if (typeof api?.hide === "function") {
    void api.hide();
  }
});
copyButton.addEventListener("click", () => void handleCopy());
applyEditedButton.addEventListener("click", () => void handleApplyEdited());
regenerateButton.addEventListener("click", () => void handleRegenerate());
clarifyRegenerateButton.addEventListener("click", () => void handleClarificationRegenerate());
restoreButton.addEventListener("click", () => void handleRestore());
cancelButton.addEventListener("click", () => void handleCancel());
compactCancelButton.addEventListener("click", () => void handleCancel());
enhancedPrompt.addEventListener("input", () => {
  state.enhancedText = enhancedPrompt.value;
  renderDiff();
  updateMeta();
  setStatus(state.phase, statusMessage.textContent);
});
modelEndpoint.addEventListener("input", markModelChanged);
modelName.addEventListener("input", markModelChanged);
apiKeyInput.addEventListener("input", markModelChanged);
saveModelButton.addEventListener("click", () => void handleSaveModel());
checkModelButton.addEventListener("click", () => void handleCheckModel());

contextMenu.addEventListener("click", (event) => {
  const hubTarget = event.target.closest("[data-hub-target]")?.dataset.hubTarget;
  if (hubTarget) {
    showHub(hubTarget);
    return;
  }
  const hubMode = event.target.closest("[data-hub-mode]")?.dataset.hubMode;
  if (hubMode) {
    state.hub = "process";
    void handleMode(hubMode, { returnToMenu: true });
    return;
  }
  const action = event.target.closest("[data-menu-action]")?.dataset.menuAction;
  if (!action) {
    return;
  }
  const parentHub = event.target.closest("[data-hub-page]")?.dataset.hubPage;
  if (parentHub && HUB_LABELS[parentHub]) {
    state.hub = parentHub;
  }
  if (action === "configure") {
    showPanel(settingsPanel);
  } else if (action === "scenes") {
    focusSceneSelector();
  } else if (action === "mascot") {
    showPanel(mascotPanel);
  } else if (action === "shortcut") {
    openShortcutPanel();
  } else if (action === "review") {
    handleReviewModeToggle();
  } else if (action === "style") {
    showPanel(stylePanel);
  } else if (action === "system-prompts") {
    openSystemPromptPanel();
  } else if (action === "check") {
    showPanel(settingsPanel);
    void handleCheckModel();
  } else if (action === "startup") {
    void handleStartupToggle();
  } else if (action === "help") {
    showPanel(helpPanel);
  } else if (action === "quit") {
    void api.quit();
  }
});

contextMenu.addEventListener("keydown", (event) => {
  const movesRight = event.key === "ArrowRight";
  const movesLeft = event.key === "ArrowLeft";
  if (!movesRight && !movesLeft) {
    return;
  }
  const tabs = [...contextMenu.querySelectorAll("[data-hub-target]")];
  const currentIndex = tabs.findIndex((tab) => tab.dataset.hubTarget === state.hub);
  const direction = movesRight ? 1 : -1;
  const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
  event.preventDefault();
  showHub(tabs[nextIndex].dataset.hubTarget);
  tabs[nextIndex].focus();
});

stylePanel.addEventListener("click", (event) => {
  const style = event.target.closest("[data-style]")?.dataset.style;
  if (style) {
    void handleStyle(style);
  }
});

viewSystemPromptButton.addEventListener("click", openSystemPromptPanel);
systemPromptModeSelect.addEventListener("change", () => {
  selectSystemPrompt(systemPromptModeSelect.value, state.systemPromptStyle);
});
systemPromptPanel.addEventListener("click", (event) => {
  const style = event.target.closest("[data-system-style]")?.dataset.systemStyle;
  if (style) {
    selectSystemPrompt(state.systemPromptMode, style);
  }
});
systemPromptCustom.addEventListener("input", () => {
  state.systemPromptDirty = true;
  saveSystemPromptButton.disabled = false;
  resetSystemPromptButton.disabled = false;
  systemPromptStatus.textContent = "已修改但尚未保存；保存后仅影响本机当前用户。";
});
saveSystemPromptButton.addEventListener("click", () => void handleSaveSystemPrompt());
resetSystemPromptButton.addEventListener("click", () => void handleResetSystemPrompt());

mascotPanel.addEventListener("click", (event) => {
  const mascot = event.target.closest("[data-mascot]")?.dataset.mascot;
  if (mascot) {
    setMascot(mascot);
    showContextMenu();
    setStatus("success", `小精灵已切换为“${MASCOTS[state.mascot].label}”。`);
  }
});

shortcutCaptureButton.addEventListener("click", beginShortcutCapture);
shortcutResetButton.addEventListener("click", () => {
  state.shortcutDraft = DEFAULT_SHORTCUT;
  state.shortcutRecording = false;
  updateShortcutPresentation();
  void applyShortcut(DEFAULT_SHORTCUT);
});
shortcutSaveButton.addEventListener("click", () => void applyShortcut(state.shortcutDraft));

mascotImage.addEventListener("error", () => {
  const current = MASCOTS[state.mascot];
  if (current?.kind === "image"
    && mascotImage.getAttribute("src") === current.asset
    && state.mascot !== "cockapoo") {
    setMascot("cockapoo");
  }
});

document.querySelectorAll("[data-close-panel]").forEach((button) => {
  button.addEventListener("click", showContextMenu);
});

petCard.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  void toggleWorkMode();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest("#contextMenu, #settingsPanel, #stylePanel, #systemPromptPanel, #mascotPanel, #shortcutPanel, #helpPanel, #petCard")) {
    hidePanels();
  }
});
document.addEventListener("keydown", (event) => {
  if (handleShortcutKeydown(event)) {
    return;
  }
  if (event.key === "Escape") {
    hidePanels();
  }
});

if (typeof api?.onCaptured === "function") {
  api.onCaptured((payload) => {
    if (resolvePendingCapture(payload)) {
      return;
    }
    if (state.requestId) {
      return;
    }
    state.cancelled = false;
    const capturedSource = acceptCapturedPayload(payload);
    if (payload?.autoEnhance === true) {
      void handleEnhance({ capturedSource });
    } else {
      setStatus("idle", "已读取当前输入框，可点击“一键增强”。");
    }
  });
}
if (typeof api?.onError === "function") {
  api.onError((error) => {
    if (!rejectPendingCapture(error)) {
      setStatus("error", errorMessage(error));
    }
  });
}
if (typeof api?.onStatus === "function") {
  api.onStatus((payload) => {
    if (payload?.status === "loading" && state.phase !== "loading") {
      setStatus("loading", payload.message ?? messages.loading);
    }
  });
}
if (typeof api?.onMenuOpen === "function") {
  api.onMenuOpen(() => showContextMenu());
}

void (async () => {
  try {
    assertApi();
    if (typeof api.getStartup === "function") {
      const startup = await api.getStartup();
      state.startup = startup?.enabled === true;
      updateStartupLabel();
    }
    const shortcut = await api.getShortcut();
    state.shortcut = normalizeShortcut(shortcut?.shortcut ?? DEFAULT_SHORTCUT);
    state.shortcutDraft = state.shortcut;
    updateShortcutPresentation();
    shortcutStatus.textContent = shortcut?.warning
      ? String(shortcut.warning)
      : `当前已启用：${shortcutDisplayLabel(state.shortcut)}。`;
    const savedConfig = await api.getModelConfig();
    if (savedConfig?.endpoint) {
      modelEndpoint.value = savedConfig.endpoint;
    }
    if (savedConfig?.model) {
      modelName.value = savedConfig.model;
    }
    if (savedConfig?.style) {
      state.style = normalizeStyle(savedConfig.style);
    }
    if (savedConfig?.mode && MODE_LABELS[savedConfig.mode]) {
      state.mode = savedConfig.mode;
    }
    if (typeof savedConfig?.targetWindowTitlePattern === "string") {
      targetWindowTitlePattern.value = savedConfig.targetWindowTitlePattern;
    }
    state.apiKeySaved = savedConfig?.apiKeySaved === true;
    state.storageAvailable = savedConfig?.storageAvailable !== false;
    state.modelConfigDirty = false;
    updateModelStorageLabel();
    updateModelConnectionLabel();
    updateStyleLabel();
    updateModeLabel();
    state.systemPromptMode = state.mode;
    state.systemPromptStyle = state.style;
    await loadSystemPrompts();
    renderSystemPromptPanel();
  } catch (error) {
    setStatus("error", errorMessage(error, "Prompt Pet 尚未连接到 Electron 主进程。"));
  }
})();

updateStyleLabel();
updateStartupLabel();
updateModelStorageLabel();
updateModelConnectionLabel();
updateMeta();
updateModeLabel();
setMascot(state.mascot, { persist: false });
updateReviewModeLabel();
updateShortcutPresentation();
updateCompactScale();
restoreCompactBounds();
setStatus("idle");
