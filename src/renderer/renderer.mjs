import {
  hasVisiblePromptText,
  normalizeCapturedPrompt,
} from "../core/capturePayload.mjs";
import { withOperationDeadline } from "../core/operationDeadline.mjs";

const MAX_PROMPT_LENGTH = 1_000_000;
const MODE_STAGE_TIMEOUT_MS = 5_000;
const CONFIGURE_STAGE_TIMEOUT_MS = 8_000;
const MODEL_STAGE_TIMEOUT_MS = 20_000;
const APPLY_STAGE_TIMEOUT_MS = 15_000;
const DEFAULT_COMPACT_WIDTH = 120;
const DEFAULT_COMPACT_HEIGHT = 140;
const MIN_COMPACT_WIDTH = 112;
const MIN_COMPACT_HEIGHT = 112;
const MAX_COMPACT_WIDTH = 700;
const MAX_COMPACT_HEIGHT = 820;
const COMPACT_SIZE_STORAGE_KEY = "prompt-pet.compact-size.v1";
const REVIEW_MODE_STORAGE_KEY = "prompt-pet.review-mode.v1";
const STYLE_LABELS = Object.freeze({
  faithful: "严格保真",
  balanced: "标准",
  concise: "简洁",
  detailed: "详细",
  professional: "专业",
  creative: "创意",
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

const root = document.querySelector(".pet-shell");
const petCard = document.querySelector("#petCard");
const petAvatar = document.querySelector("#petAvatar");
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
const cancelButton = document.querySelector("#cancelButton");
const restoreButton = document.querySelector("#restoreButton");
const copyButton = document.querySelector("#copyButton");
const applyEditedButton = document.querySelector("#applyEditedButton");
const regenerateButton = document.querySelector("#regenerateButton");
const contextMenu = document.querySelector("#contextMenu");
const resultMenuButton = document.querySelector("#resultMenuButton");
const currentStyleLabel = document.querySelector("#currentStyleLabel");
const currentModeLabel = document.querySelector("#currentModeLabel");
const reviewModeButton = document.querySelector("#reviewModeButton");
const reviewModeLabel = document.querySelector("#reviewModeLabel");
const startupLabel = document.querySelector("#startupLabel");
const settingsPanel = document.querySelector("#settingsPanel");
const stylePanel = document.querySelector("#stylePanel");
const modePanel = document.querySelector("#modePanel");
const modelEndpoint = document.querySelector("#modelEndpoint");
const modelName = document.querySelector("#modelName");
const apiKeyInput = document.querySelector("#apiKey");
const modelStorageStatus = document.querySelector("#modelStorageStatus");
const targetWindowTitlePattern = document.querySelector("#targetWindowTitlePattern");
const checkModelButton = document.querySelector("#checkModelButton");
const saveModelButton = document.querySelector("#saveModelButton");
const resizeHandle = document.querySelector("#resizeHandle");
const compactModeBadge = document.querySelector("#compactModeBadge");
const compactFeedback = document.querySelector("#compactFeedback");
const compactFeedbackText = document.querySelector("#compactFeedbackText");
const compactCancelButton = document.querySelector("#compactCancelButton");
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

const initialCompactSize = readCompactSize();

const state = {
  phase: "idle",
  originalText: "",
  enhancedText: "",
  target: undefined,
  requestId: undefined,
  cancelled: false,
  style: "balanced",
  mode: "enhance",
  startup: false,
  apiKeySaved: false,
  storageAvailable: true,
  applying: false,
  replacementConfirmed: false,
  appliedText: "",
  generationOperationId: undefined,
  reviewMode: readReviewMode(),
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
  idle: "准备就绪。左键处理当前发言，右键切换工作模式。",
  loading: "正在读取当前输入框并调用模型，请稍候…",
  success: "处理完成，结果已回填。原文仍可恢复或复制。",
  error: "操作失败，原始输入框未被覆盖，请检查设置后重试。",
});

function compactFeedbackMessage(phase, message) {
  if (phase === "loading") {
    return state.applying ? "正在回填…" : "处理中…";
  }
  if (phase === "success" && message.startsWith("工作模式已切换")) {
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
  cancelButton.disabled = phase !== "loading" || state.applying;
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
  void api.resize(360, 520, { persist: false });
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
  currentStyleLabel.textContent = STYLE_LABELS[state.style] ?? STYLE_LABELS.balanced;
  document.querySelectorAll(".style-option").forEach((button) => {
    const selected = button.dataset.style === state.style;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function updateModeLabel() {
  const presentation = MODE_PRESENTATION[state.mode] ?? MODE_PRESENTATION.enhance;
  currentModeLabel.textContent = MODE_LABELS[state.mode] ?? MODE_LABELS.enhance;
  petActionTitle.textContent = presentation.action;
  compactModeBadge.textContent = presentation.badge;
  compactModeBadge.setAttribute("aria-label", "当前模式：" + (MODE_LABELS[state.mode] ?? MODE_LABELS.enhance));
  document.querySelectorAll(".mode-option").forEach((button) => {
    const selected = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function updateReviewModeLabel() {
  reviewModeLabel.textContent = state.reviewMode ? "已开启" : "已关闭";
  reviewModeButton.setAttribute("aria-checked", String(state.reviewMode));
  reviewModeButton.classList.toggle("is-active", state.reviewMode);
}

function updateStartupLabel() {
  startupLabel.textContent = state.startup ? "已开启" : "已关闭";
}

function updateModelStorageLabel() {
  if (state.apiKeySaved) {
    modelStorageStatus.textContent = "API Key 已加密保存，可留空复用；不会显示明文。";
    modelStorageStatus.dataset.state = "saved";
    apiKeyInput.placeholder = "已保存，可留空不修改";
  } else if (state.storageAvailable) {
    modelStorageStatus.textContent = "填写 API Key 后点击保存配置，将使用 Windows 加密存储。";
    modelStorageStatus.dataset.state = "pending";
    apiKeyInput.placeholder = "请输入你的 API Key";
  } else {
    modelStorageStatus.textContent = "当前系统无法启用加密存储，Key 只能保存在本次运行内存中。";
    modelStorageStatus.dataset.state = "warning";
    apiKeyInput.placeholder = "请输入本次运行使用的 API Key";
  }
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
      return "工作模式无效，请重新选择。";
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
      return "模型结果未通过安全校验，原文未被覆盖；请重试或切换“严格保真”。";
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
  contextMenu.hidden = false;
  settingsPanel.hidden = panel !== settingsPanel;
  stylePanel.hidden = panel !== stylePanel;
  modePanel.hidden = panel !== modePanel;
  requestAnimationFrame(() => {
    panel.scrollIntoView({ block: "nearest" });
  });
}

function showContextMenu() {
  expandAssistant();
  contextMenu.hidden = false;
  settingsPanel.hidden = true;
  stylePanel.hidden = true;
  modePanel.hidden = true;
}

function hidePanels({ collapse = true } = {}) {
  contextMenu.hidden = true;
  settingsPanel.hidden = true;
  stylePanel.hidden = true;
  modePanel.hidden = true;
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

function handleShowResult() {
  if (!state.enhancedText) {
    return;
  }
  expandAssistant();
  hidePanels({ collapse: false });
  resultPanel.hidden = false;
  resultMenuButton.hidden = false;
  updateMeta();
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
  enhancedPrompt.value = "";
  hideNeedsInput();
  renderDiff();
  resultPanel.hidden = true;
  resultMenuButton.hidden = true;
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
  apiKeyInput.value = "";
  if (result?.style && STYLE_LABELS[result.style]) {
    state.style = result.style;
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

async function handleEnhance({ capturedSource } = {}) {
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
  state.requestId = requestId;
  state.cancelled = false;
  state.enhancedText = "";
  state.replacementConfirmed = false;
  state.appliedText = "";
  state.generationOperationId = undefined;
  enhancedPrompt.value = "";
  resultPanel.hidden = true;
  resultMenuButton.hidden = true;
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
    enhancedPrompt.value = state.enhancedText;
    renderDiff();
    resultPanel.hidden = false;
    resultMenuButton.hidden = false;
    updateMeta();

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

    if (state.reviewMode) {
      expandAssistant();
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
      resultMenuButton.hidden = true;
    } else {
      resultPanel.hidden = false;
      resultMenuButton.hidden = false;
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
  const sourceWithClarification = [
    state.originalText,
    "",
    "--- 用户补充信息（仅用于消解歧义）---",
    supplement,
  ].join("\n");
  const previousReviewMode = state.reviewMode;
  state.reviewMode = true;
  updateReviewModeLabel();
  try {
    await handleEnhance({
      capturedSource: { text: sourceWithClarification, target: state.target },
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
  try {
    setStatus("loading", "正在请求模型进行 Key 有效性检查…");
    const result = await api.checkModel({
      endpoint: modelEndpoint.value.trim(),
      model: modelName.value.trim(),
      apiKey: apiKeyInput.value,
      targetWindowTitlePattern: targetWindowTitlePattern.value.trim(),
    });
    await configureModel();
    setStatus("success", "模型 Key 有效，已连接并保存 "
      + (result?.model ?? modelName.value.trim()) + "。");
  } catch (error) {
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
    state.style = result?.style ?? style;
    updateStyleLabel();
    hidePanels();
    setStatus("success", "提示词风格已切换为“"
      + (STYLE_LABELS[state.style] ?? state.style) + "”。");
  } catch (error) {
    setStatus("error", errorMessage(error, "提示词风格保存失败。"));
  }
}

async function handleMode(mode) {
  if (state.requestId) {
    setStatus("loading", "正在处理当前输入，本次使用的模式不会中途切换。");
    return;
  }
  try {
    const result = await api.setMode(mode);
    state.mode = result?.mode ?? mode;
    updateModeLabel();
    hidePanels();
    setStatus("success", "工作模式已切换为“"
      + (MODE_LABELS[state.mode] ?? state.mode) + "”。");
  } catch (error) {
    setStatus("error", errorMessage(error, "工作模式切换失败。"));
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
    setStatus("success", "增强结果已复制到剪贴板。");
  } catch (error) {
    setStatus("error", errorMessage(error, "复制失败，增强结果仍保留在助手中。"));
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
    enhancedPrompt.value = "";
    renderDiff();
    resultPanel.hidden = true;
    resultMenuButton.hidden = true;
    updateMeta();
    setStatus("success", "已恢复原文，目标输入框内容未再被增强结果覆盖。");
  } catch (error) {
    setStatus("error", errorMessage(error, "恢复失败，原文仍保留在助手中。"));
  }
}

async function handleCancel() {
  if (state.phase !== "loading") {
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
  if (state.phase !== "loading") {
    statusMessage.textContent = "模型配置已修改，保存或检查后再增强。";
  }
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
  const action = event.target.closest("[data-menu-action]")?.dataset.menuAction;
  if (!action) {
    return;
  }
  if (action === "configure") {
    showPanel(settingsPanel);
  } else if (action === "mode") {
    showPanel(modePanel);
  } else if (action === "review") {
    handleReviewModeToggle();
  } else if (action === "style") {
    showPanel(stylePanel);
  } else if (action === "check") {
    showPanel(settingsPanel);
    void handleCheckModel();
  } else if (action === "startup") {
    void handleStartupToggle();
  } else if (action === "result") {
    handleShowResult();
  } else if (action === "quit") {
    void api.quit();
  }
});

stylePanel.addEventListener("click", (event) => {
  const style = event.target.closest("[data-style]")?.dataset.style;
  if (style) {
    void handleStyle(style);
  }
});

modePanel.addEventListener("click", (event) => {
  const mode = event.target.closest("[data-mode]")?.dataset.mode;
  if (mode) {
    void handleMode(mode);
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
  if (!event.target.closest("#contextMenu, #settingsPanel, #stylePanel, #modePanel, #petCard")) {
    hidePanels();
  }
});
document.addEventListener("keydown", (event) => {
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
    const savedConfig = await api.getModelConfig();
    if (savedConfig?.endpoint) {
      modelEndpoint.value = savedConfig.endpoint;
    }
    if (savedConfig?.model) {
      modelName.value = savedConfig.model;
    }
    if (savedConfig?.style && STYLE_LABELS[savedConfig.style]) {
      state.style = savedConfig.style;
    }
    if (savedConfig?.mode && MODE_LABELS[savedConfig.mode]) {
      state.mode = savedConfig.mode;
    }
    if (typeof savedConfig?.targetWindowTitlePattern === "string") {
      targetWindowTitlePattern.value = savedConfig.targetWindowTitlePattern;
    }
    state.apiKeySaved = savedConfig?.apiKeySaved === true;
    state.storageAvailable = savedConfig?.storageAvailable !== false;
    updateModelStorageLabel();
    updateModeLabel();
  } catch (error) {
    setStatus("error", errorMessage(error, "Prompt Pet 尚未连接到 Electron 主进程。"));
  }
})();

updateStyleLabel();
updateStartupLabel();
updateModelStorageLabel();
updateMeta();
updateModeLabel();
updateReviewModeLabel();
updateCompactScale();
restoreCompactBounds();
setStatus("idle");
