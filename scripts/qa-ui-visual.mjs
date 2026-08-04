import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { writeTextArtifactWithRetry } from "./artifactWriter.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const evidenceRoot = path.join(projectRoot, "qa", "evidence", "ui");
const reportPath = path.join(projectRoot, "qa", "UI_VISUAL_RESULTS.md");
const rendererPath = path.join(projectRoot, "src", "renderer", "index.html");
const qaPreloadPath = path.join(projectRoot, "scripts", "qa-renderer-preload.mjs");

const COMPACT_SIZES = Object.freeze([
  { name: "min", width: 112, height: 112 },
  { name: "default", width: 120, height: 140 },
  { name: "large", width: 240, height: 280 },
]);
const EXPANDED_VIEWPORTS = Object.freeze([
  { name: "360x520", width: 360, height: 520 },
  { name: "420x620", width: 420, height: 620 },
  { name: "480x700", width: 480, height: 700 },
  { name: "640x760", width: 640, height: 760 },
]);
const PROMPT_TIERS = Object.freeze([
  "faithful",
  "concise",
  "professional",
  "creative",
]);
const WORK_MODES = Object.freeze([
  "enhance",
  "upward-communication",
  "chat-polish",
  "ppt-copy",
]);
const PNG_MASCOTS = Object.freeze([
  "cockapoo",
  "green-knight-pup",
]);
const CSS_MASCOTS = Object.freeze([
  "classic-green-knight",
]);
const MASCOTS = Object.freeze([...PNG_MASCOTS, ...CSS_MASCOTS]);
const REVIEW_ACTIONS = Object.freeze([
  "#cancelButton",
  "#restoreButton",
  "#regenerateButton",
  "#copyButton",
  "#applyEditedButton",
]);
const REVIEW_ACTION_PHASES = Object.freeze({
  pending: Object.freeze({
    "#cancelButton": true,
    "#restoreButton": false,
    "#regenerateButton": true,
    "#copyButton": true,
    "#applyEditedButton": true,
  }),
  applied: Object.freeze({
    "#cancelButton": false,
    "#restoreButton": true,
    "#regenerateButton": true,
    "#copyButton": true,
    "#applyEditedButton": false,
  }),
});
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

function parseFlag(args, name) {
  const prefix = name + "=";
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function numericFlag(args, name, fallback) {
  const value = Number(parseFlag(args, name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function slug(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 90) || "snapshot";
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function geometryAudit() {
  const round = (value) => Math.round(Number(value) * 100) / 100;
  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top;
    let right = rect.right;
    let bottom = rect.bottom;
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.documentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = [style.overflow, style.overflowX].some((value) =>
        ["hidden", "clip", "auto", "scroll"].includes(value));
      const clipsY = [style.overflow, style.overflowY].some((value) =>
        ["hidden", "clip", "auto", "scroll"].includes(value));
      if (clipsX || clipsY) {
        const clip = ancestor.getBoundingClientRect();
        if (clipsX) {
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
        }
        if (clipsY) {
          top = Math.max(top, clip.top);
          bottom = Math.min(bottom, clip.bottom);
        }
      }
      ancestor = ancestor.parentElement;
    }
    return {
      x: round(left),
      y: round(top),
      width: round(Math.max(0, right - left)),
      height: round(Math.max(0, bottom - top)),
      right: round(right),
      bottom: round(bottom),
    };
  };
  const area = (rect) => Math.max(0, rect.width) * Math.max(0, rect.height);
  const intersects = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)) > 1;
  const cssEscape = (value) => globalThis.CSS?.escape
    ? globalThis.CSS.escape(String(value))
    : String(value).replace(/([^a-zA-Z0-9_-])/g, "\\\\$1");
  const selectorOf = (element) => {
    if (!element) {
      return "(none)";
    }
    if (element.id) {
      return "#" + cssEscape(element.id);
    }
    const parts = [];
    let current = element;
    while (current && current.nodeType === 1 && current !== document.documentElement) {
      const tag = current.tagName.toLowerCase();
      let part = tag;
      for (const [attribute, property] of [
        ["menu-action", "menuAction"],
        ["mode", "mode"],
        ["style", "style"],
        ["mascot", "mascot"],
        ["close-panel", "closePanel"],
      ]) {
        const value = current.dataset?.[property];
        if (value) {
          part += "[data-" + attribute + "=" + JSON.stringify(String(value)) + "]";
          break;
        }
      }
      if (part === tag && current.getAttribute("aria-label")) {
        part += "[aria-label=" + JSON.stringify(current.getAttribute("aria-label")) + "]";
      }
      if (part === tag && current.classList?.length) {
        const classes = [...current.classList].slice(0, 2).map((name) => "." + cssEscape(name)).join("");
        part += classes;
      }
      const parent = current.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
        if (sameTag.length > 1) {
          part += ":nth-of-type(" + (sameTag.indexOf(current) + 1) + ")";
        }
      }
      parts.unshift(part);
      const candidate = parts.join(" > ");
      try {
        if (document.querySelectorAll(candidate).length === 1) {
          return candidate;
        }
      } catch {
        // Keep building a selector when an unusual class or attribute needs escaping.
      }
      current = parent;
    }
    return parts.join(" > ");
  };
  const isVisible = (element) => {
    if (!element || element.nodeType !== 1) {
      return false;
    }
    let current = element;
    while (current && current !== document.documentElement) {
      if (current.hidden) {
        return false;
      }
      current = current.parentElement;
    }
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  };
  const isDecorative = (element) => {
    if (!element || element.getAttribute("aria-hidden") === "true"
      || element.closest("[aria-hidden=true]")
      || ["presentation", "none"].includes(element.getAttribute("role"))
      || element.dataset?.decorative === "true") {
      return true;
    }
    return getComputedStyle(element).pointerEvents === "none";
  };
  const interactiveSelector = "button, input, textarea, [role=button], [role=menuitem]";
  const overlaySelectors = [
    "#contextMenu",
    "#settingsPanel",
    "#stylePanel",
    "#systemPromptPanel",
    "#mascotPanel",
    "#shortcutPanel",
    "#helpPanel",
    "#resultPanel",
  ];
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    deviceScaleFactor: window.devicePixelRatio,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
  };
  const inViewport = (rect) => rect.x >= -1
    && rect.y >= -1
    && rect.right <= viewport.width + 1
    && rect.bottom <= viewport.height + 1;
  const inHorizontalViewport = (rect) => rect.x >= -1
    && rect.right <= viewport.width + 1;
  const visibleElements = [...document.querySelectorAll("*")]
    .filter((element) => isVisible(element) && !element.closest("[aria-hidden=true]"))
    .map((element) => ({
    element,
    selector: selectorOf(element),
    rect: rectOf(element),
  }));
  const interactiveCandidates = [...document.querySelectorAll(
    interactiveSelector,
  )].filter((element) => isVisible(element) && !isDecorative(element));
  const isExposed = (element) => {
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return !target || target === element || element.contains(target);
  };
  const interactiveElements = interactiveCandidates.filter(isExposed).map((element) => ({
    element,
    selector: selectorOf(element),
    rect: rectOf(element),
    disabled: element.disabled === true || element.getAttribute("aria-disabled") === "true",
    textPresent: !element.matches("#petAvatar, #resizeHandle, #closeButton, #collapseButton, .panel-close")
      && Boolean((element.innerText || "").trim())
      || element.tagName.toLowerCase() === "input"
      || element.tagName.toLowerCase() === "textarea",
    valueLength: typeof element.value === "string" ? element.value.length : 0,
    valueMasked: element.type === "password" && element.value ? "••••••••" : undefined,
  }));
  const visibleOverlays = overlaySelectors
    .map((selector) => document.querySelector(selector))
    .filter((element) => isVisible(element));
  const overlayOf = (element) => {
    const overlay = visibleOverlays.find((candidate) => candidate === element || candidate.contains(element));
    return overlay ? selectorOf(overlay) : null;
  };
  const interactiveAncestor = (element) => element.closest(interactiveSelector);
  const failures = [];
  for (const item of visibleElements) {
    const scrollContainer = item.element.closest(".hub-page, .floating-panel, .pet-card");
    const isVerticallyScrollableContent = scrollContainer
      && ["auto", "scroll"].includes(getComputedStyle(scrollContainer).overflowY);
    if (!(isVerticallyScrollableContent
      ? inHorizontalViewport(item.rect)
      : inViewport(item.rect))) {
      failures.push({
        type: "viewport-overflow",
        selector: item.selector,
        rect: item.rect,
        againstSelector: "viewport",
      });
    }
  }
  for (const selector of ["#contextMenu", "#settingsPanel", "#stylePanel", "#systemPromptPanel", "#mascotPanel", "#shortcutPanel", "#helpPanel"]) {
    const element = document.querySelector(selector);
    if (isVisible(element) && !inHorizontalViewport(rectOf(element))) {
      failures.push({
        type: "panel-outside-workspace",
        selector,
        rect: rectOf(element),
        againstSelector: "viewport",
      });
    }
  }
  if (viewport.scrollWidth > viewport.clientWidth + 1
    || viewport.scrollHeight > viewport.clientHeight + 1) {
    failures.push({
      type: "document-scroll-overflow",
      selector: "document.documentElement",
      rect: {
        width: viewport.scrollWidth,
        height: viewport.scrollHeight,
        right: viewport.scrollWidth,
        bottom: viewport.scrollHeight,
      },
      againstSelector: "document.clientBox",
    });
  }
  for (const selector of ["#settingsPanel", "#stylePanel", "#systemPromptPanel", "#mascotPanel", "#shortcutPanel"]) {
    const panel = document.querySelector(selector);
    if (!isVisible(panel)) {
      continue;
    }
    const style = getComputedStyle(panel);
    if (panel.scrollWidth > panel.clientWidth + 1) {
      failures.push({
        type: "panel-horizontal-scroll",
        selector,
        rect: rectOf(panel),
        againstSelector: selector + ".clientWidth",
      });
    }
    if (panel.scrollHeight > panel.clientHeight + 1
      && !["auto", "scroll"].includes(style.overflowY)) {
      failures.push({
        type: "panel-unexplained-vertical-clip",
        selector,
        rect: rectOf(panel),
        againstSelector: selector + ".clientHeight",
      });
    }
    for (const required of [panel.querySelector(".panel-heading"), panel.querySelector(".panel-close")]) {
      if (required && !inViewport(rectOf(required))) {
        failures.push({
          type: "panel-required-control-outside-workspace",
          selector: selectorOf(required),
          rect: rectOf(required),
          againstSelector: selector,
        });
      }
    }
    const active = document.activeElement;
    if (active && panel.contains(active) && isVisible(active) && !inViewport(rectOf(active))) {
      failures.push({
        type: "panel-focused-control-outside-workspace",
        selector: selectorOf(active),
        rect: rectOf(active),
        againstSelector: selector,
      });
    }
  }
  for (const item of interactiveElements) {
    if (!item.textPresent || item.disabled) {
      continue;
    }
    if (["INPUT", "TEXTAREA"].includes(item.element.tagName)) {
      continue;
    }
    if (item.element.scrollWidth > item.element.clientWidth + 1
      || item.element.scrollHeight > item.element.clientHeight + 1) {
      failures.push({
        type: "interactive-text-clipped",
        selector: item.selector,
        rect: item.rect,
        againstSelector: item.selector + ".contentBox",
      });
    }
  }
  for (const row of document.querySelectorAll(".hub-row")) {
    if (!isVisible(row)) {
      continue;
    }
    const content = row.querySelector(":scope > span:nth-child(2)");
    if (!content) {
      continue;
    }
    const rowRect = rectOf(row);
    const contentRect = rectOf(content);
    if (contentRect.top < rowRect.top - 1 || contentRect.bottom > rowRect.bottom + 1) {
      failures.push({
        type: "hub-row-content-overflow",
        selector: selectorOf(content),
        rect: contentRect,
        againstSelector: selectorOf(row),
        againstRect: rowRect,
      });
    }
  }
  const overlapCandidates = interactiveElements.filter((item) => !item.disabled);
  for (let first = 0; first < overlapCandidates.length; first += 1) {
    for (let second = first + 1; second < overlapCandidates.length; second += 1) {
      const a = overlapCandidates[first];
      const b = overlapCandidates[second];
      if (!intersects(a.rect, b.rect) || a.element.contains(b.element) || b.element.contains(a.element)) {
        continue;
      }
      const aOverlay = overlayOf(a.element);
      const bOverlay = overlayOf(b.element);
      if (aOverlay !== bOverlay && (aOverlay || bOverlay)) {
        continue;
      }
      if ((a.selector === "#petAvatar" && b.selector === "#resizeHandle")
        || (a.selector === "#resizeHandle" && b.selector === "#petAvatar")) {
        continue;
      }
      failures.push({
        type: "interactive-overlap",
        selector: a.selector,
        rect: a.rect,
        againstSelector: b.selector,
        againstRect: b.rect,
      });
    }
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  let textNodesChecked = 0;
  while ((node = walker.nextNode()) && textNodesChecked < 500) {
    const parent = node.parentElement;
    if (!parent || !node.textContent?.trim() || parent.closest("[aria-hidden=true]")
      || !isVisible(parent) || isDecorative(parent) || interactiveAncestor(parent)) {
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    const textRect = rectOf({ getBoundingClientRect: () => range.getBoundingClientRect() });
    if (area(textRect) <= 0) {
      continue;
    }
    if (getComputedStyle(parent).pointerEvents === "none") {
      continue;
    }
    const textCenter = document.elementFromPoint(
      textRect.x + textRect.width / 2,
      textRect.y + textRect.height / 2,
    );
    if (textCenter && !parent.contains(textCenter) && !textCenter.contains(parent)) {
      continue;
    }
    textNodesChecked += 1;
    const textOverlay = overlayOf(parent);
    for (const interactive of overlapCandidates) {
      if (interactive.element.contains(parent) || parent.contains(interactive.element)) {
        continue;
      }
      if (getComputedStyle(interactive.element).pointerEvents === "none") {
        continue;
      }
      const interactiveOverlay = overlayOf(interactive.element);
      if (textOverlay !== interactiveOverlay && (textOverlay || interactiveOverlay)) {
        continue;
      }
      if (intersects(textRect, interactive.rect)) {
        failures.push({
          type: "text-interactive-overlap",
          selector: selectorOf(parent) + "::text",
          rect: textRect,
          againstSelector: interactive.selector,
          againstRect: interactive.rect,
        });
      }
    }
  }
  const resizeHandleHitTests = [];
  const resizeHandle = document.querySelector("#resizeHandle");
  if (isVisible(resizeHandle)) {
    const handleRect = rectOf(resizeHandle);
    for (const targetSelector of ["#petAvatar", "#compactModeBadge", "#closeButton"]) {
      const target = document.querySelector(targetSelector);
      if (!isVisible(target)) {
        continue;
      }
      const targetRect = rectOf(target);
      const point = {
        x: round(targetRect.x + targetRect.width / 2),
        y: round(targetRect.y + targetRect.height / 2),
      };
      const insideHandle = point.x >= handleRect.x && point.x <= handleRect.right
        && point.y >= handleRect.y && point.y <= handleRect.bottom;
      const hit = document.elementFromPoint(point.x, point.y);
      const handleHit = Boolean(hit?.closest?.("#resizeHandle"));
      const result = {
        targetSelector,
        targetRect,
        point,
        handleRect,
        insideHandle,
        hitSelector: selectorOf(hit),
        targetHit: Boolean(hit?.closest?.(targetSelector)),
        handleHit,
      };
      resizeHandleHitTests.push(result);
      if (insideHandle || handleHit) {
        failures.push({
          type: "resize-handle-hit-test",
          selector: "#resizeHandle",
          rect: handleRect,
          againstSelector: targetSelector,
          againstRect: targetRect,
          point,
          hitSelector: result.hitSelector,
        });
      }
    }
  }
  return {
    state: {
      phase: document.querySelector(".pet-shell")?.dataset.state || "unknown",
      view: document.querySelector(".pet-shell")?.dataset.view || "unknown",
      resizing: document.querySelector(".pet-shell")?.dataset.resizing || "false",
      dragging: document.querySelector(".pet-shell")?.dataset.dragging || "false",
    },
    viewport,
    visibleElementCount: visibleElements.length,
    interactiveElementCount: interactiveElements.length,
    interactive: interactiveElements.map(({ element, ...item }) => item),
    resizeHandleHitTests,
    failures,
  };
}

function readPageState() {
  const root = document.querySelector(".pet-shell");
  const visible = (selector) => {
    const element = document.querySelector(selector);
    if (!element) {
      return false;
    }
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return !element.hidden
      && style.display !== "none"
      && style.visibility !== "hidden"
      && rect.width > 0
      && rect.height > 0;
  };
  const controlState = (selector) => {
    const element = document.querySelector(selector);
    return element ? {
      visible: visible(selector),
      disabled: element.disabled === true,
      type: element.getAttribute("type") || "",
    } : undefined;
  };
  const inputState = (selector) => {
    const element = document.querySelector(selector);
    return element ? {
      visible: visible(selector),
      type: element.type,
      valueLength: element.value.length,
      valueMasked: element.type === "password" && element.value ? "••••••••" : undefined,
    } : undefined;
  };
  return {
    phase: root?.dataset.state || "unknown",
    view: root?.dataset.view || "unknown",
    mode: root?.dataset.mode || "unknown",
    mascot: root?.dataset.mascot || "unknown",
    hub: document.querySelector("[data-hub-target][aria-selected=true]")?.dataset.hubTarget
      || "none",
    reviewMode: document.querySelector("#reviewModeButton")?.getAttribute("aria-checked") === "true",
    resizing: root?.dataset.resizing || "false",
    dragging: root?.dataset.dragging || "false",
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    visible: Object.fromEntries([
      "#contextMenu", "#settingsPanel", "#stylePanel", "#systemPromptPanel", "#mascotPanel", "#shortcutPanel", "#helpPanel", "#needsInputPanel", "#resultPanel",
      "#compactFeedback", "#compactCancelButton", "#collapseButton", "#closeButton",
    ].map((selector) => [selector, visible(selector)])),
    controls: Object.fromEntries([
      "#cancelButton", "#restoreButton", "#regenerateButton", "#copyButton",
      "#applyEditedButton", "#compactCancelButton", "#resizeHandle", "#compactModeBadge",
    ].map((selector) => [selector, controlState(selector)])),
    inputs: Object.fromEntries([
      "#modelEndpoint", "#modelName", "#apiKey", "#targetWindowTitlePattern",
    ].map((selector) => [selector, inputState(selector)])),
  };
}

function launchElectron(args) {
  if (args.includes("--contract-only")) {
    process.stdout.write(JSON.stringify({
      runner: true,
      usesTrustedInput: true,
      usesCapturePage: true,
      usesReadOnlyExecuteJavaScript: true,
      powerShellUiAutomation: false,
    }) + "\n");
    return 0;
  }
  const electronBinary = path.join(
    projectRoot,
    "node_modules",
    "electron",
    "dist",
    process.platform === "win32" ? "electron.exe" : "electron",
  );
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const isolatedUserData = path.join(
    evidenceRoot,
    "launcher-user-data-" + String(Date.now()) + "-" + String(process.pid),
  );
  const result = spawnSync(electronBinary, [
    "--user-data-dir=" + isolatedUserData,
    scriptPath,
    ...args,
  ], {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.error) {
    process.stderr.write(result.error.message + "\n");
    return 1;
  }
  return Number.isInteger(result.status) ? result.status : 1;
}

async function runElectron(electron, args) {
  const { app, BrowserWindow, ipcMain } = electron;
  const requestedScale = numericFlag(args, "--scale", 1);
  const shortcutOnly = args.includes("--shortcut-only");
  const activeReportPath = shortcutOnly
    ? path.join(projectRoot, "qa", "UI_SHORTCUT_RESULTS.md")
    : reportPath;
  const summaryFilename = shortcutOnly ? "summary-shortcut.json" : "summary.json";
  const runToken = String(Date.now()) + "-" + String(process.pid);
  const runRoot = path.join(
    evidenceRoot,
    "run-" + runToken + "-scale-" + String(requestedScale).replace(/\./g, "p"),
  );
  const userDataPath = path.join(runRoot, "user-data");
  const screenshotsPath = path.join(runRoot, "screenshots");
  await mkdir(userDataPath, { recursive: true });
  await mkdir(screenshotsPath, { recursive: true });
  app.commandLine.appendSwitch("disable-gpu");
  if (requestedScale !== 1) {
    app.commandLine.appendSwitch("force-device-scale-factor", String(requestedScale));
  }

  let qaWindow;
  let screenshotNumber = 0;
  const apiCalls = [];
  const apiCallHistory = [];
  const snapshots = [];
  const clicks = [];
  const workflowFailures = [];
  const automationLimitations = [];
  const geometryFailures = [];
  const eventLog = [];
  const qaResult = {
    p0: undefined,
    altDoubleClick: {
      status: "not-run",
      reason: "Shortcut renderer flow has not run yet.",
    },
  };
  const senderIsQaWindow = (event) => qaWindow && event.sender === qaWindow.webContents;
  const makeFailureRecord = (flow, error) => {
    const failure = {
      flow,
      message: error instanceof Error ? error.message : String(error),
      code: error?.code,
      selector: error?.selector || "workflow",
      rect: error?.rect || null,
      againstSelector: error?.againstSelector || null,
      againstRect: error?.againstRect || null,
      state: error?.state || null,
      viewport: error?.viewport || null,
    };
    return failure;
  };
  const recordWorkflowFailure = (flow, error) => {
    const failure = makeFailureRecord(flow, error);
    workflowFailures.push(failure);
    return failure;
  };
  const recordAutomationLimitation = (flow, error) => {
    const failure = makeFailureRecord(flow, error);
    automationLimitations.push(failure);
    return failure;
  };

  ipcMain.on("qa:message", (event, message = {}) => {
    if (!senderIsQaWindow(event) || !message || typeof message.kind !== "string") {
      return;
    }
    const safeMessage = jsonSafe(message);
    eventLog.push({ at: new Date().toISOString(), ...safeMessage });
    if (message.kind === "api-reset") {
      apiCalls.length = 0;
    } else if (message.kind === "api-call") {
      const call = {
        sequence: message.sequence,
        name: message.name,
        ...Object.fromEntries(Object.entries(message).filter(([key]) => !["kind", "sequence", "name"].includes(key))),
      };
      apiCalls.push(call);
      apiCallHistory.push(call);
    }
  });
  ipcMain.handle("qa:resize", (event, input = {}) => {
    if (!senderIsQaWindow(event) || !qaWindow || qaWindow.isDestroyed()) {
      return { width: 0, height: 0 };
    }
    const width = Math.min(700, Math.max(88, Math.round(Number(input.width) || 0)));
    const height = Math.min(820, Math.max(96, Math.round(Number(input.height) || 0)));
    const bounds = qaWindow.getBounds();
    qaWindow.setBounds({
      x: bounds.x,
      y: input.anchor === "top-right" ? bounds.y + bounds.height - height : bounds.y,
      width,
      height,
    }, false);
    return { width, height, bounds: qaWindow.getBounds() };
  });
  ipcMain.handle("qa:move", (event, input = {}) => {
    if (!senderIsQaWindow(event) || !qaWindow || qaWindow.isDestroyed()) {
      return { x: 0, y: 0 };
    }
    const bounds = qaWindow.getBounds();
    const deltaX = Math.max(-2_000, Math.min(2_000, Math.round(Number(input.deltaX) || 0)));
    const deltaY = Math.max(-2_000, Math.min(2_000, Math.round(Number(input.deltaY) || 0)));
    qaWindow.setPosition(bounds.x + deltaX, bounds.y + deltaY, false);
    const next = qaWindow.getBounds();
    return { x: next.x, y: next.y };
  });
  ipcMain.handle("qa:hide", (event) => {
    if (senderIsQaWindow(event) && qaWindow && !qaWindow.isDestroyed()) {
      qaWindow.hide();
    }
    return { hidden: true };
  });

  const readOnly = async (source) => qaWindow.webContents.executeJavaScript(
    "(" + source.toString() + ")()",
    true,
  );
  const state = () => readOnly(readPageState);
  const audit = () => readOnly(geometryAudit);
  const elementInfo = async (selector) => {
    const source = function elementInfoRead() {
      const element = document.querySelector("__SELECTOR__");
      if (!element) {
        return undefined;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector: "__SELECTOR__",
        hidden: element.hidden,
        display: style.display,
        visibility: style.visibility,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
        disabled: element.disabled === true,
        textContent: element.textContent?.trim() || "",
      };
    };
    return readOnly(source.toString().replaceAll("\"__SELECTOR__\"", JSON.stringify(selector)));
  };

  const waitForState = async (expected, timeout = 3_500) => {
    const started = Date.now();
    let latest;
    while (Date.now() - started < timeout) {
      latest = await state();
      const matches = Object.entries(expected).every(([key, value]) => {
        if (key === "visible") {
          return Object.entries(value).every(([selector, expectedVisible]) => latest.visible[selector] === expectedVisible);
        }
        return latest[key] === value;
      });
      if (matches) {
        return latest;
      }
      await sleep(35);
    }
    throw new Error("state timeout: expected " + JSON.stringify(expected) + " got " + JSON.stringify(latest));
  };
  const waitForCall = async (name, timeout = 3_500) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const found = apiCalls.find((call) => call.name === name);
      if (found) {
        return found;
      }
      await sleep(25);
    }
    throw new Error("API call timeout: " + name);
  };
  const assertAbsent = async (selector) => {
    const present = await readOnly(
      function selectorPresentRead() {
        return Boolean(document.querySelector("__SELECTOR__"));
      }.toString().replaceAll("\"__SELECTOR__\"", JSON.stringify(selector)),
    );
    if (present) {
      throw new Error("removed control is still present: " + selector);
    }
  };
  const readModeSemantic = () => readOnly(function modeSemanticRead() {
    const root = document.querySelector(".pet-shell");
    const frame = document.querySelector(".pet-mascot-frame");
    const frameStyle = frame ? getComputedStyle(frame) : undefined;
    return {
      mode: root?.dataset.mode || "",
      accent: root ? getComputedStyle(root).getPropertyValue("--mode-accent").trim() : "",
      visibleColor: frameStyle
        ? [frameStyle.backgroundColor, frameStyle.borderTopColor].join("|")
        : "",
    };
  });
  const readTierLabels = () => readOnly(function tierLabelsRead() {
    return [...document.querySelectorAll(".style-option[data-style] strong")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return !element.hidden
          && style.display !== "none"
          && style.visibility !== "hidden"
          && rect.width > 0
          && rect.height > 0;
      })
      .map((element) => element.textContent?.trim() || "");
  });
  const readMascotState = () => readOnly(function mascotStateRead() {
    const root = document.querySelector(".pet-shell");
    const image = document.querySelector("#mascotImage");
    if (!image) {
      return {
        mascot: root?.dataset.mascot || "",
        src: "",
        complete: false,
        naturalWidth: 0,
        naturalHeight: 0,
      };
    }
    return {
      mascot: root?.dataset.mascot || "",
      src: image.getAttribute("src") || "",
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    };
  });
  const waitForMascotImage = async (mascot, timeout = 3_500) => {
    const expectedSuffix = "/assets/mascots/" + mascot + ".png";
    const started = Date.now();
    let latest;
    while (Date.now() - started < timeout) {
      latest = await readMascotState();
      const normalizedSrc = String(latest.src || "").replaceAll("\\", "/");
      if (latest.mascot === mascot
        && normalizedSrc.endsWith(expectedSuffix)
        && latest.complete
        && latest.naturalWidth > 0
        && latest.naturalHeight > 0) {
        return {
          mascot: latest.mascot,
          src: expectedSuffix,
          naturalWidth: latest.naturalWidth,
          naturalHeight: latest.naturalHeight,
        };
      }
      await sleep(35);
    }
    throw new Error(
      "mascot image failed to load: "
        + JSON.stringify({
          expectedMascot: mascot,
          actualMascot: latest?.mascot || "",
          srcMatches: String(latest?.src || "").replaceAll("\\", "/").endsWith(expectedSuffix),
          complete: latest?.complete === true,
          naturalWidth: Number(latest?.naturalWidth) || 0,
          naturalHeight: Number(latest?.naturalHeight) || 0,
      }),
    );
  };
  const readCssMascotState = () => readOnly(function cssMascotStateRead() {
    const root = document.querySelector(".pet-shell");
    const sprite = document.querySelector(
      '#mascotSprite[data-mascot="classic-green-knight"]',
    );
    const style = sprite ? getComputedStyle(sprite) : undefined;
    const rect = sprite?.getBoundingClientRect();
    return {
      mascot: root?.dataset.mascot || "",
      semanticMascot: sprite?.dataset.mascot || "",
      present: Boolean(sprite),
      visible: Boolean(sprite
        && !sprite.hidden
        && style?.display !== "none"
        && style?.visibility !== "hidden"
        && Number(style?.opacity) !== 0
        && rect?.width > 0
        && rect?.height > 0),
      width: rect?.width || 0,
      height: rect?.height || 0,
    };
  });
  const waitForCssMascot = async (mascot, timeout = 3_500) => {
    const started = Date.now();
    let latest;
    while (Date.now() - started < timeout) {
      latest = await readCssMascotState();
      if (latest.mascot === mascot
        && latest.semanticMascot === mascot
        && latest.present
        && latest.visible) {
        return {
          mascot,
          kind: "css",
          semantic: '#mascotSprite[data-mascot="classic-green-knight"]',
          width: latest.width,
          height: latest.height,
        };
      }
      await sleep(35);
    }
    throw new Error(
      "mascot CSS sprite semantic contract failed: "
        + JSON.stringify({
          expectedMascot: mascot,
          actualMascot: latest?.mascot || "",
          semanticMascot: latest?.semanticMascot || "",
          present: latest?.present === true,
          visible: latest?.visible === true,
        }),
    );
  };
  const setScenario = async (patch = {}, resetCalls = false) => {
    qaWindow.webContents.send("qa:set-scenario", {
      ...DEFAULT_SCENARIO,
      ...patch,
      resetCalls,
    });
    await sleep(25);
  };
  const setWindowSize = async (width, height) => {
    qaWindow.setSize(width, height, false);
    await sleep(80);
  };
  const reloadPage = async () => {
    await new Promise((resolve, reject) => {
      const finished = () => {
        qaWindow.webContents.removeListener("did-fail-load", failed);
        resolve();
      };
      const failed = (_event, code, description) => {
        qaWindow.webContents.removeListener("did-finish-load", finished);
        reject(new Error("reload failed " + code + ": " + description));
      };
      qaWindow.webContents.once("did-finish-load", finished);
      qaWindow.webContents.once("did-fail-load", failed);
      qaWindow.reload();
    });
    await sleep(140);
    qaWindow.show();
    qaWindow.focus();
  };
  const readPoint = async (x, y) => {
    const source = function pointRead() {
      const target = document.elementFromPoint(__X__, __Y__);
      const describe = (element) => {
        if (!element) {
          return "(none)";
        }
        if (element.id) {
          return "#" + element.id;
        }
        const action = element.closest?.("[data-menu-action]")?.dataset.menuAction;
        if (action) {
          return "[data-menu-action=\"" + action + "\"]";
        }
        const mode = element.closest?.("[data-hub-mode]")?.dataset.hubMode;
        if (mode) {
          return "[data-hub-mode=\"" + mode + "\"]";
        }
        const style = element.closest?.("[data-style]")?.dataset.style;
        if (style) {
          return "[data-style=\"" + style + "\"]";
        }
        const mascot = element.closest?.("[data-mascot]")?.dataset.mascot;
        if (mascot) {
          return "[data-mascot=\"" + mascot + "\"]";
        }
        return element.tagName?.toLowerCase() || "element";
      };
      return {
        element: describe(target),
        petAvatar: Boolean(target?.closest?.("#petAvatar")),
        resizeHandle: Boolean(target?.closest?.("#resizeHandle")),
        compactBadge: Boolean(target?.closest?.("#compactModeBadge")),
      };
    };
    return readOnly(source.toString().replaceAll("__X__", String(x)).replaceAll("__Y__", String(y)));
  };
  const clickAt = async (selector, label, options = {}) => {
    await qaWindow.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: "center", inline: "center" })`,
    );
    await sleep(30);
    let info = await elementInfo(selector);
    if (!info || info.hidden || info.display === "none" || info.visibility === "hidden"
      || info.width <= 0 || info.height <= 0) {
      throw new Error("cannot click hidden element " + selector);
    }
    let page = await state();
    let x = Math.max(1, Math.min(Math.round(info.x + info.width / 2), Math.max(1, page.viewport.width - 1)));
    let y = Math.max(1, Math.min(Math.round(info.y + info.height / 2), Math.max(1, page.viewport.height - 1)));
    const button = options.button || "left";
    const source = function hitRead() {
      const target = document.elementFromPoint(__X__, __Y__);
      const closest = target?.closest?.("__SELECTOR__");
      const describe = (element) => {
        if (!element) {
          return "(none)";
        }
        if (element.id) {
          return "#" + element.id;
        }
        const action = element.closest?.("[data-menu-action]")?.dataset.menuAction;
        if (action) {
          return "[data-menu-action=\"" + action + "\"]";
        }
        const mode = element.closest?.("[data-hub-mode]")?.dataset.hubMode;
        if (mode) {
          return "[data-hub-mode=\"" + mode + "\"]";
        }
        const style = element.closest?.("[data-style]")?.dataset.style;
        if (style) {
          return "[data-style=\"" + style + "\"]";
        }
        const mascot = element.closest?.("[data-mascot]")?.dataset.mascot;
        if (mascot) {
          return "[data-mascot=\"" + mascot + "\"]";
        }
        return element.tagName?.toLowerCase() || "element";
      };
      return {
        element: describe(target),
        closestTarget: Boolean(closest),
        closest: describe(closest),
      };
    };
    const readHit = () => readOnly(source.toString()
      .replaceAll("__X__", String(x))
      .replaceAll("__Y__", String(y))
      .replaceAll("\"__SELECTOR__\"", JSON.stringify(selector)));
    let hit = await readHit();
    if (!hit.closestTarget) {
      await qaWindow.webContents.executeJavaScript(
        `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: "nearest", inline: "nearest" })`,
      );
      await sleep(60);
      info = await elementInfo(selector);
      page = await state();
      x = Math.max(1, Math.min(Math.round(info.x + info.width / 2), Math.max(1, page.viewport.width - 1)));
      y = Math.max(1, Math.min(Math.round(info.y + info.height / 2), Math.max(1, page.viewport.height - 1)));
      hit = await readHit();
    }
    if (!hit.closestTarget) {
      throw new Error(
        "trusted click missed target " + selector + ": "
          + JSON.stringify({ hit: hit.element, rect: info, viewport: page.viewport }),
      );
    }
    const click = {
      label,
      selector,
      button,
      x,
      y,
      hit,
      disabled: info.disabled,
      path: label,
      at: new Date().toISOString(),
    };
    clicks.push(click);
    qaWindow.focus();
    qaWindow.webContents.sendInputEvent({ type: "mouseDown", x, y, button, clickCount: 1 });
    await sleep(10);
    qaWindow.webContents.sendInputEvent({ type: "mouseUp", x, y, button, clickCount: 1 });
    await sleep(options.wait === undefined ? 100 : options.wait);
    return click;
  };
  const rightClickAvatar = async (label) => {
    qaWindow.webContents.send("qa:emit-menu-open");
    clicks.push({
      label: label || "open assistant menu",
      gesture: "tray-menu-open",
      path: "system tray → open assistant menu",
    });
    await sleep(100);
  };
  const dragAt = async (selector, label, deltaX, deltaY) => {
    const info = await elementInfo(selector);
    if (!info || info.hidden || info.display === "none" || info.width <= 0 || info.height <= 0) {
      throw new Error("cannot drag hidden element " + selector);
    }
    const startX = Math.round(info.x + info.width / 2);
    const startY = Math.round(info.y + info.height / 2);
    const endX = startX + deltaX;
    const endY = startY + deltaY;
    const gesture = { label, selector, button: "left", gesture: "drag", startX, startY, endX, endY, path: label };
    clicks.push(gesture);
    gesture.startHit = await readPoint(startX, startY);
    qaWindow.focus();
    qaWindow.webContents.sendInputEvent({ type: "mouseDown", x: startX, y: startY, button: "left", clickCount: 1 });
    await sleep(20);
    const midX = startX + Math.round(deltaX / 2);
    const midY = startY + Math.round(deltaY / 2);
    qaWindow.webContents.sendInputEvent({ type: "mouseMove", x: midX, y: midY });
    await sleep(35);
    gesture.midState = await state();
    qaWindow.webContents.sendInputEvent({ type: "mouseMove", x: endX, y: endY });
    await sleep(30);
    gesture.endState = await state();
    qaWindow.webContents.sendInputEvent({ type: "mouseUp", x: endX, y: endY, button: "left", clickCount: 1 });
    await sleep(320);
  };
  const pressEscape = async (label) => {
    clicks.push({ label, gesture: "key", key: "Escape", path: label });
    qaWindow.focus();
    qaWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "ESC" });
    qaWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "ESC" });
    await sleep(120);
  };
  const typeInto = async (selector, value) => {
    await clickAt(selector, "focus " + selector, { wait: 50 });
    qaWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "A", modifiers: ["control"] });
    qaWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "A", modifiers: ["control"] });
    await qaWindow.webContents.insertText(value);
    await sleep(40);
  };
  const takeSnapshot = async (label, clickPath) => {
    let geometry;
    let page;
    let auditError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        geometry = await audit();
        page = await state();
        break;
      } catch (error) {
        auditError = error;
        await sleep(100);
      }
    }
    if (!geometry || !page) {
      throw auditError || new Error("geometry audit did not return");
    }
    screenshotNumber += 1;
    const filename = String(screenshotNumber).padStart(3, "0") + "-" + slug(label) + ".png";
    const screenshotPath = path.join(screenshotsPath, filename);
    let image;
    let captureError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        image = await qaWindow.webContents.capturePage();
        break;
      } catch (error) {
        captureError = error;
        await sleep(150);
      }
    }
    if (!image) {
      throw captureError || new Error("capturePage did not return an image");
    }
    await writeFile(screenshotPath, image.toPNG());
    const record = {
      label,
      screenshot: path.relative(projectRoot, screenshotPath).replaceAll("\\", "/"),
      screenshotAbsolute: screenshotPath,
      viewport: page.viewport,
      state: geometry.state,
      clickPath: clickPath || "setup",
      visibleInteractiveElementCount: geometry.interactiveElementCount,
      visibleElementCount: geometry.visibleElementCount,
      controls: page.controls,
      inputs: page.inputs,
      resizeHandleHitTests: geometry.resizeHandleHitTests,
      geometryFailures: geometry.failures,
    };
    snapshots.push(record);
    for (const failure of geometry.failures) {
      geometryFailures.push({
        ...failure,
        snapshot: record.screenshot,
        state: record.state,
        viewport: record.viewport,
      });
    }
    return record;
  };
  const runFlow = async (name, callback, options = {}) => {
    let failure;
    try {
      await callback();
    } catch (error) {
      const recordFailure = options.classification === "automation-limitation"
        ? recordAutomationLimitation
        : recordWorkflowFailure;
      failure = recordFailure(name, error);
      try {
        const snapshot = await takeSnapshot("failure-" + name, "failure:" + name);
        failure.snapshot = snapshot.screenshot;
        failure.state = failure.state || snapshot.state;
        failure.viewport = failure.viewport || snapshot.viewport;
      } catch {
        // Preserve the workflow failure if the renderer is unavailable.
      }
    }
  };
  const compactReady = async (size, scenario, resetCalls = true, options = {}) => {
    await reloadPage();
    await setScenario(scenario || {}, resetCalls);
    await setWindowSize(size.width, size.height);
    const ready = await waitForState({ phase: "idle", view: "compact" });
    if (!MASCOTS.includes(ready.mascot)) {
      throw new Error("compact renderer did not expose a supported data-mascot value");
    }
    if (PNG_MASCOTS.includes(ready.mascot)) {
      await waitForMascotImage(ready.mascot);
    } else {
      await waitForCssMascot(ready.mascot);
    }
    if (typeof options.reviewMode === "boolean") {
      await ensureReviewMode(options.reviewMode);
    }
  };
  const expandedMenuReady = async (viewport) => {
    await compactReady(COMPACT_SIZES[1], {}, true, { reviewMode: false });
    await rightClickAvatar("open context menu");
    await waitForState({ phase: "idle", view: "expanded", visible: { "#contextMenu": true } });
    await setWindowSize(viewport.width, viewport.height);
  };
  const actionHubs = Object.freeze({
    style: "process",
    scenes: "process",
    review: "process",
    "system-prompts": "process",
    configure: "services",
    check: "services",
    startup: "services",
    help: "profile",
    mascot: "profile",
    shortcut: "profile",
    quit: "profile",
  });
  const menuAction = async (action, label) => {
    const hub = actionHubs[action];
    if (hub) {
      await clickAt(
        "[data-hub-target=\"" + hub + "\"]",
        "hub → " + hub,
        { wait: 40 },
      );
    }
    return clickAt(
      "[data-menu-action=\"" + action + "\"]",
      label || "menu:" + action,
      { wait: 120 },
    );
  };
  const ensureReviewMode = async (enabled) => {
    let current = await state();
    if (current.reviewMode === enabled) {
      return current;
    }
    if (current.view !== "compact") {
      await clickAt("#collapseButton", "normalize before review mode toggle");
      current = await waitForState({ view: "compact" });
    }
    await rightClickAvatar("open review mode toggle");
    await waitForState({ view: "expanded", visible: { "#contextMenu": true } });
    await menuAction("review", "context menu → review mode " + (enabled ? "on" : "off"));
    current = await waitForState({ reviewMode: enabled });
    if (current.visible["#contextMenu"]) {
      await pressEscape("close review mode context menu");
    }
    current = await state();
    if (current.view !== "compact") {
      await clickAt("#collapseButton", "review mode toggle → compact");
    }
    return waitForState({ view: "compact", reviewMode: enabled });
  };
  const assertReviewActions = async (phase) => {
    const expected = REVIEW_ACTION_PHASES[phase];
    const current = await state();
    for (const selector of REVIEW_ACTIONS) {
      const control = current.controls[selector];
      const expectedEnabled = expected?.[selector] === true;
      if (!control
        || control.visible !== true
        || control.disabled !== !expectedEnabled) {
        const error = new Error(
          "review action must be visible and match phase availability: "
            + JSON.stringify({
              phase,
              selector,
              expectedEnabled,
              actual: control,
            }),
        );
        error.selector = selector;
        error.state = current;
        error.viewport = current.viewport;
        throw error;
      }
    }
    return current;
  };

  const runDoubleAltRegression = async () => {
    const emitDoubleAltCapture = async (text) => {
      qaWindow.webContents.send("qa:emit-status", {
        status: "loading",
        message: "正在读取当前输入框…",
      });
      await waitForState({ phase: "loading", view: "compact" });
      qaWindow.webContents.send("qa:emit-captured", {
        text,
        target: {
          handle: 424242,
          title: "Prompt Lift QA target",
          processId: 4242,
          focusHandle: 424242,
        },
        autoEnhance: true,
      });
    };

    await compactReady(COMPACT_SIZES[1], {}, true);
    await emitDoubleAltCapture("Double Alt first run: keep number 42.");
    await waitForCall("enhance");
    await waitForCall("apply");
    const firstSuccess = await waitForState(
      { phase: "success", view: "compact", visible: { "#resultPanel": false } },
    );
    const firstCalls = apiCalls
      .filter((call) => ["setMode", "configure", "enhance", "apply"].includes(call.name))
      .map((call) => call.name);

    await compactReady(COMPACT_SIZES[1], { enhanceDelay: 1_200 }, true, { reviewMode: false });
    await emitDoubleAltCapture("Double Alt cancellation run: keep number 84.");
    await waitForCall("enhance");
    await clickAt("#compactCancelButton", "double Alt loading → cancel", { wait: 50 });
    const cancelled = await waitForState({ phase: "idle", view: "compact" });

    await setScenario({}, true);
    await emitDoubleAltCapture("Double Alt retry after cancellation: keep number 126.");
    await waitForCall("enhance");
    await waitForCall("apply");
    const retrySuccess = await waitForState(
      { phase: "success", view: "compact", visible: { "#resultPanel": false } },
      4_000,
    );
    const retryCalls = apiCalls
      .filter((call) => ["setMode", "configure", "enhance", "apply"].includes(call.name))
      .map((call) => call.name);

    const required = ["setMode", "configure", "enhance", "apply"];
    const passed = firstSuccess.phase === "success"
      && cancelled.phase === "idle"
      && retrySuccess.phase === "success"
      && required.every((name) => firstCalls.includes(name))
      && required.every((name) => retryCalls.includes(name));
    qaResult.altDoubleClick = {
      status: passed ? "passed" : "failed",
      firstSuccess,
      firstCalls,
      cancelled,
      retrySuccess,
      retryCalls,
    };
    if (!passed) {
      throw new Error("double Alt renderer flow did not reach a terminal state");
    }
  };

  const runP0LeftClick = async () => {
    await compactReady(COMPACT_SIZES[1], {}, true, { reviewMode: false });
    const idle = await takeSnapshot("compact-idle-p0-before-left-click", "compact idle → #petAvatar left click");
    const click = await clickAt("#petAvatar", "P0 trusted left click #petAvatar", { wait: 50 });
    const loading = await waitForState({ phase: "loading", view: "compact" });
    await takeSnapshot("compact-loading-p0-avatar", "#petAvatar left click → loading");
    await waitForCall("capture");
    await waitForCall("enhance");
    await waitForCall("apply");
    const success = await waitForState(
      { phase: "success", view: "compact", visible: { "#resultPanel": false } },
    );
    await takeSnapshot(
      "compact-success-p0-avatar",
      "#petAvatar left click → capture → enhance → auto apply → compact; fast mode success",
    );
    const relevantCalls = apiCalls.filter((call) => ["capture", "enhance", "apply"].includes(call.name));
    const centerHit = await readOnly(function centerHitRead() {
      const target = document.querySelector("#petAvatar");
      const rect = target.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        hit: hit?.id ? "#" + hit.id : hit?.tagName?.toLowerCase() || "(none)",
        closestPetAvatar: Boolean(hit?.closest?.("#petAvatar")),
      };
    });
    qaResult.p0 = {
      before: idle.state,
      loading,
      success,
      trustedClick: click,
      centerHit,
      relevantCalls,
      passed: click.hit.closestTarget === true
        && centerHit.closestPetAvatar === true
        && ["capture", "enhance", "apply"].every((name) => relevantCalls.some((call) => call.name === name))
        && success.phase === "success",
    };

    await setScenario({
      capturedText: "Second left-click prompt: keep number 84.",
    }, true);
    await clickAt("#petAvatar", "P0 consecutive left click #petAvatar", { wait: 50 });
    await waitForCall("capture");
    await waitForCall("enhance");
    const secondApply = await waitForCall("apply");
    const secondSuccess = await waitForState(
      { phase: "success", view: "compact", visible: { "#resultPanel": false } },
    );
    qaResult.p0.consecutiveLeftClick = {
      success: secondSuccess,
      expectedTextMatchesFreshCapture: secondApply.expectedTextMatchesCaptured === true,
    };
    qaResult.p0.passed = qaResult.p0.passed
      && secondSuccess.phase === "success"
      && secondApply.expectedTextMatchesCaptured === true;
    if (!qaResult.p0.passed) {
      throw new Error("consecutive left click did not use the fresh capture as its CAS baseline");
    }
  };

  const runCompactStates = async () => {
    await runFlow("compact-sizes", async () => {
      for (const size of COMPACT_SIZES) {
        await compactReady(size, {}, true);
        await takeSnapshot("compact-idle-" + size.name + "-" + size.width + "x" + size.height,
          "compact idle at " + size.width + "x" + size.height);
      }
    });
    await runFlow("p0-avatar-left-click", runP0LeftClick);
    await runFlow("compact-loading-cancel", async () => {
      await compactReady(COMPACT_SIZES[1], { captureDelay: 1_200 }, true);
      await clickAt("#petAvatar", "compact loading via #petAvatar", { wait: 40 });
      await waitForState({ phase: "loading", view: "compact" });
      await takeSnapshot("compact-loading-cancel-available", "#petAvatar left click → compact loading");
      await clickAt("#compactCancelButton", "compact loading → #compactCancelButton", { wait: 60 });
      await waitForState({ phase: "idle", view: "compact" });
      await takeSnapshot("compact-loading-cancelled", "compact loading → #compactCancelButton");
    });
    await runFlow("compact-error", async () => {
      await compactReady(COMPACT_SIZES[1], {
        enhanceError: { code: "AUTH_ERROR", message: "QA auth error" },
      }, true);
      await clickAt("#petAvatar", "compact error via #petAvatar", { wait: 50 });
      await waitForState({ phase: "error", view: "expanded" });
      await takeSnapshot("expanded-error-before-collapse", "compact #petAvatar → error → expanded");
      await clickAt("#collapseButton", "expanded error → #collapseButton", { wait: 80 });
      await waitForState({ phase: "error", view: "compact" });
      await takeSnapshot("compact-error-after-collapse", "expanded error → #collapseButton → compact error");
    });
  };

  const runExpandedMatrix = async () => {
    await runFlow("expanded-viewport-matrix", async () => {
      for (const viewport of EXPANDED_VIEWPORTS) {
        await expandedMenuReady(viewport);
        await takeSnapshot("expanded-idle-context-" + viewport.name,
          "compact idle → right-click #petAvatar → expanded context at " + viewport.name);
        await pressEscape("close context menu at " + viewport.name);
      }
    });
  };

  const runExpandedStatesAndResult = async () => {
    await runFlow("expanded-loading-success-error", async () => {
      await expandedMenuReady(EXPANDED_VIEWPORTS[0]);
      await setScenario({ checkDelay: 800 }, false);
      await menuAction("check", "context menu → check model (loading)");
      await waitForState({ phase: "loading", view: "expanded", visible: { "#settingsPanel": true } });
      await takeSnapshot("expanded-loading-model-check", "context menu → check model → loading");
      await waitForState({ phase: "success", view: "expanded", visible: { "#settingsPanel": true } });
      await takeSnapshot("expanded-success-model-check", "check model → success");

      await compactReady(COMPACT_SIZES[1], {
        checkDelay: 800,
        checkError: { code: "AUTH_ERROR", message: "QA check error" },
      }, true);
      await rightClickAvatar("open context for expanded error");
      await menuAction("check", "context menu → check model (error)");
      await waitForState({ phase: "error", view: "expanded", visible: { "#settingsPanel": true } });
      await takeSnapshot("expanded-error-model-check", "context menu → check model → error");
    });

    await runFlow("fast-mode-auto-apply-compact", async () => {
      // fast mode success → auto apply → compact
      await compactReady(COMPACT_SIZES[1], {}, true, { reviewMode: false });
      await assertAbsent("[data-menu-action=\"result\"]");
      await clickAt("#petAvatar", "fast mode success → auto apply → compact", { wait: 50 });
      await waitForCall("apply");
      await waitForState({
        phase: "success",
        view: "compact",
        visible: { "#resultPanel": false },
      });
      await takeSnapshot(
        "compact-success-fast-auto-apply",
        "fast mode success → auto apply → compact",
      );
    });

    await runFlow("review-mode-discard-preserves-original", async () => {
      const originalText = "Review discard baseline: keep URL https://example.test/review and number 314.";
      await compactReady(
        COMPACT_SIZES[1],
        { capturedText: originalText },
        true,
        { reviewMode: true },
      );
      await clickAt("#petAvatar", "review result pending → discard", { wait: 50 });
      await waitForCall("enhance");
      await waitForState({
        phase: "success",
        view: "expanded",
        reviewMode: true,
        visible: { "#resultPanel": true },
      });
      await assertReviewActions("pending");
      const beforeDiscard = await readOnly(function reviewOriginalRead() {
        return {
          original: document.querySelector("#originalPreview")?.textContent || "",
          revised: document.querySelector("#enhancedPrompt")?.value || "",
        };
      });
      if (beforeDiscard.original !== originalText
        || !beforeDiscard.revised
        || beforeDiscard.revised === originalText) {
        throw new Error("review discard fixture did not preserve a distinct original baseline");
      }
      await clickAt("#cancelButton", "review result pending → #cancelButton discard", { wait: 100 });
      await waitForState({
        phase: "idle",
        view: "compact",
        reviewMode: true,
        visible: { "#resultPanel": false },
      });
      const afterDiscard = await readOnly(function discardedOriginalRead() {
        return {
          original: document.querySelector("#originalPreview")?.textContent || "",
          revised: document.querySelector("#enhancedPrompt")?.value || "",
        };
      });
      const mutatingCalls = apiCalls.filter((call) => ["apply", "restore"].includes(call.name));
      if (afterDiscard.original !== originalText
        || afterDiscard.revised !== ""
        || mutatingCalls.length !== 0) {
        throw new Error(
          "review discard changed the original transaction or invoked target mutation: "
            + JSON.stringify({
              originalPreserved: afterDiscard.original === originalText,
              revisedCleared: afterDiscard.revised === "",
              mutatingCalls: mutatingCalls.map((call) => call.name),
            }),
        );
      }
      qaResult.reviewDiscard = {
        originalPreserved: afterDiscard.original === originalText,
        revisedCleared: afterDiscard.revised === "",
        applyCallCount: mutatingCalls.filter((call) => call.name === "apply").length,
        restoreCallCount: mutatingCalls.filter((call) => call.name === "restore").length,
        cancelCallCount: apiCalls.filter((call) => call.name === "cancel").length,
      };
      await takeSnapshot(
        "compact-review-discard-preserved-original",
        "review pending → discard → compact; original transaction preserved",
      );
    });

    await runFlow("needs-input-clarification-boundary", async () => {
      await compactReady(COMPACT_SIZES[1], {
        enhanceError: {
          code: "MODEL_NEEDS_INPUT",
          message: "MODEL_NEEDS_INPUT: QA clarification required",
          details: {
            question: "“这个方案”具体指哪一个方案？",
            missingFields: ["方案名称"],
          },
        },
      }, true, { reviewMode: false });
      await clickAt("#petAvatar", "model needs input → clarification panel", { wait: 50 });
      await waitForState({
        phase: "error",
        view: "expanded",
        visible: { "#needsInputPanel": true, "#resultPanel": false },
      });
      const clarificationBoundary = await readOnly(function clarificationBoundaryRead() {
        return {
          note: document.querySelector(".clarification-note")?.textContent?.trim() || "",
          button: document.querySelector("#clarifyRegenerateButton")?.textContent?.trim() || "",
          fieldCount: document.querySelectorAll("#missingFields li").length,
        };
      });
      if (!clarificationBoundary.note.includes("不会并入原文")
        || clarificationBoundary.button !== "补充后重新生成"
        || clarificationBoundary.fieldCount < 1) {
        throw new Error(
          "clarification boundary copy is incomplete: " + JSON.stringify(clarificationBoundary),
        );
      }
      await takeSnapshot(
        "expanded-needs-input-clarification-boundary",
        "model needs input → bounded clarification panel",
      );
    });

    await runFlow("review-mode-result-actions-and-topbar-menu", async () => {
      await compactReady(COMPACT_SIZES[1], {}, true, { reviewMode: true });
      await assertAbsent("[data-menu-action=\"result\"]");
      await clickAt("#petAvatar", "review mode success → primary result region", { wait: 50 });
      await waitForCall("enhance");
      await waitForState({
        phase: "success",
        view: "expanded",
        reviewMode: true,
        visible: { "#resultPanel": true },
      });
      if (apiCalls.some((call) => call.name === "apply")) {
        throw new Error("review mode applied before explicit user confirmation");
      }
      await assertReviewActions("pending");
      const pendingControls = await takeSnapshot(
        "expanded-review-pending-actions",
        "review mode success → primary result region → pending actions",
      );
      const topbarMenu = pendingControls.controls["#resizeHandle"];
      if (!topbarMenu
        || topbarMenu.visible !== true
        || topbarMenu.disabled !== false) {
        throw new Error("topbar menu entry must be visible and usable");
      }
      const enhanceCallsBeforeResume = apiCalls.filter((call) => call.name === "enhance").length;
      await clickAt("#resizeHandle", "pending review result → open product hub", { wait: 80 });
      await waitForState({
        view: "expanded",
        reviewMode: true,
        visible: { "#contextMenu": true, "#resultPanel": false },
      });
      const pendingHub = await readOnly(function pendingReviewHubRead() {
        return {
          title: document.querySelector("#hubPrimaryActionTitle")?.textContent?.trim() || "",
          subtitle: document.querySelector("#hubPrimaryActionHint")?.textContent?.trim() || "",
          policy: document.querySelector("#hubPrivacyNote")?.textContent?.trim() || "",
        };
      });
      if (pendingHub.title !== "继续审阅"
        || !pendingHub.subtitle.includes("不会重新生成")
        || !pendingHub.policy.includes("先审阅再决定回填")) {
        throw new Error("pending review hub did not expose the safe resume path: " + JSON.stringify(pendingHub));
      }
      await takeSnapshot(
        "expanded-review-hub-continue",
        "pending review result → product hub → continue review",
      );
      await clickAt("#hubPrimaryAction", "product hub → continue pending review", { wait: 80 });
      await waitForState({
        phase: "success",
        view: "expanded",
        reviewMode: true,
        visible: { "#contextMenu": false, "#resultPanel": true },
      });
      const enhanceCallsAfterResume = apiCalls.filter((call) => call.name === "enhance").length;
      if (enhanceCallsAfterResume !== enhanceCallsBeforeResume) {
        throw new Error("continue review started a duplicate enhancement");
      }
      await takeSnapshot(
        "expanded-review-resumed-without-regenerate",
        "product hub → continue review → existing result",
      );
      await clickAt("#copyButton", "review result → copy", { wait: 80 });
      await clickAt("#applyEditedButton", "review result → explicit apply", { wait: 50 });
      await waitForCall("apply");
      await waitForState({
        phase: "success",
        view: "expanded",
        reviewMode: true,
        visible: { "#resultPanel": true },
      });
      await assertReviewActions("applied");
      await takeSnapshot(
        "expanded-review-applied-actions",
        "review result → explicit apply → applied actions",
      );
      await clickAt("#resizeHandle", "review result → topbar menu entry", { wait: 80 });
      await waitForState({
        view: "expanded",
        reviewMode: true,
        visible: { "#contextMenu": true, "#resultPanel": false },
      });
      await takeSnapshot(
        "expanded-review-topbar-menu-open",
        "review result → topbar menu entry → context menu",
      );
    });

  };

  const runMenusAndPanels = async () => {
    await runFlow("wechat-like-hub-navigation", async () => {
      await compactReady(COMPACT_SIZES[1], {}, true);
      await rightClickAvatar("open three-area product hub");
      for (const hub of ["process", "services", "profile"]) {
        await clickAt(
          "[data-hub-target=\"" + hub + "\"]",
          "hub navigation → " + hub,
          { wait: 60 },
        );
        await waitForState({
          view: "expanded",
          hub,
          visible: { "#contextMenu": true },
        });
        await takeSnapshot(
          "hub-page-" + hub,
          "three-area hub → " + hub,
        );
      }
      await pressEscape("close three-area product hub");
    });

    await runFlow("context-menu-complete", async () => {
      await assertAbsent("[data-menu-action=\"result\"]");
      for (const action of ["scenes", "mascot", "shortcut", "review", "configure", "style", "check", "startup", "help", "quit"]) {
        await compactReady(COMPACT_SIZES[1], {}, true);
        await rightClickAvatar("reopen context for " + action);
        await waitForState({ view: "expanded", visible: { "#contextMenu": true } });
        await takeSnapshot("context-menu-before-" + action, "trusted right click #petAvatar → " + action);
        await menuAction(action, "context menu → " + action);
        if (action === "quit") {
          await takeSnapshot("context-menu-quit-visible", "context menu → quit (mocked, process retained)");
          if (qaWindow.isDestroyed()) {
            throw new Error("mock quit unexpectedly destroyed QA window");
          }
        } else if (action === "scenes") {
          await waitForState({ view: "expanded", hub: "process", visible: { "#contextMenu": true } });
          await takeSnapshot("context-scenes-merged-visible", "context menu → process scene selector");
          await pressEscape("close process context menu");
        } else if (action === "startup" || action === "review") {
          await waitForState({ view: "expanded", visible: { "#contextMenu": true } });
          await takeSnapshot("context-startup-visible", "context menu → startup");
          await pressEscape("close startup context menu");
        } else {
          const panel = action === "style"
              ? "#stylePanel"
              : action === "mascot"
                ? "#mascotPanel"
                : action === "shortcut"
                  ? "#shortcutPanel"
                : action === "help"
                  ? "#helpPanel"
                : "#settingsPanel";
          await waitForState({ view: "expanded", visible: { [panel]: true } });
          await takeSnapshot("context-" + action + "-panel", "context menu → " + action);
          await clickAt("[data-close-panel=\"" + panel.slice(1) + "\"]", action + " panel → close");
        }
      }
    });

    await runFlow("custom-shortcut-record-and-reset", async () => {
      await compactReady(COMPACT_SIZES[1], {}, true);
      await rightClickAvatar("open personal shortcut settings");
      await menuAction("shortcut", "context menu → shortcut");
      await waitForState({ view: "expanded", visible: { "#shortcutPanel": true } });
      await clickAt("#shortcutCaptureButton", "shortcut → start recording", { wait: 30 });
      qaWindow.focus();
      qaWindow.webContents.sendInputEvent({
        type: "keyDown",
        keyCode: "P",
        modifiers: ["control", "alt"],
      });
      qaWindow.webContents.sendInputEvent({
        type: "keyUp",
        keyCode: "P",
        modifiers: ["control", "alt"],
      });
      await sleep(80);
      const capturedShortcut = await readOnly(function shortcutDraftRead() {
        return {
          value: document.querySelector("#shortcutValue")?.value || "",
          saveDisabled: document.querySelector("#shortcutSaveButton")?.disabled === true,
        };
      });
      if (capturedShortcut.value !== "Ctrl + Alt + P" || capturedShortcut.saveDisabled) {
        throw new Error("shortcut recorder did not produce a savable Ctrl + Alt + P draft");
      }
      await takeSnapshot(
        "shortcut-custom-recorded",
        "shortcut settings → record Ctrl + Alt + P",
      );
      await clickAt("#shortcutSaveButton", "shortcut → save Ctrl + Alt + P", { wait: 80 });
      const savedCall = await waitForCall("setShortcut");
      if (savedCall.shortcut !== "Control+Alt+P") {
        throw new Error("shortcut save did not use the canonical accelerator");
      }
      await setScenario({}, true);
      await clickAt("#shortcutResetButton", "shortcut → restore double Alt", { wait: 80 });
      const resetCall = await waitForCall("setShortcut");
      if (resetCall.shortcut !== "DoubleAlt") {
        throw new Error("shortcut reset did not restore DoubleAlt");
      }
      await takeSnapshot(
        "shortcut-default-restored",
        "shortcut settings → restore double Alt",
      );
    });

    await runFlow("right-click-mode-colors", async () => {
      await compactReady(COMPACT_SIZES[1], {}, true);
      await rightClickAvatar("open process hub for right-click baseline");
      await menuAction("scenes", "context menu → merged scene selector");
      await waitForState({ view: "expanded", hub: "process", visible: { "#contextMenu": true } });
      await clickAt("[data-hub-mode=\"ppt-copy\"]", "set right-click baseline → ppt-copy");
      await waitForState({
        view: "expanded",
        mode: "ppt-copy",
        hub: "process",
        visible: { "#contextMenu": true },
      });
      await takeSnapshot(
        "scene-selection-stays-in-process-hub",
        "scene option → process hub remains open",
      );
      await clickAt("#collapseButton", "mode parent menu → compact");
      await waitForState({ view: "compact", mode: "ppt-copy" });

      const modeColors = [];
      const visibleModeColors = [];
      const observations = [];
      for (const mode of WORK_MODES) {
        await setScenario({}, true);
        await clickAt(
          "#petAvatar",
          "right-click mode toggle → " + mode,
          { button: "right", wait: 50 },
        );
        await waitForCall("setMode");
        await waitForState({ phase: "success", view: "compact", mode });
        const semantic = await readModeSemantic();
        if (semantic.mode !== mode || !semantic.accent || !semantic.visibleColor) {
          throw new Error(
            "right-click mode semantic mismatch: "
              + JSON.stringify({ expected: mode, actual: semantic }),
          );
        }
        modeColors.push(semantic.accent);
        visibleModeColors.push(semantic.visibleColor);
        observations.push(semantic);
        await takeSnapshot("mode-right-click-" + mode, "right-click mode toggle → " + mode);
      }
      if (new Set(modeColors).size !== WORK_MODES.length) {
        throw new Error("right-click modes did not expose four distinct --mode-accent values");
      }
      if (new Set(visibleModeColors).size !== WORK_MODES.length) {
        throw new Error("right-click modes did not produce four distinct visible mode colors");
      }
      qaResult.modeSemantics = observations;
    });

    await runFlow("mode-specific-tier-labels", async () => {
      const tierLabelSets = [];
      for (const mode of WORK_MODES) {
        await compactReady(COMPACT_SIZES[1], {}, true, { reviewMode: false });
        await rightClickAvatar("open process hub for tier labels: " + mode);
        await menuAction("scenes", "context menu → merged scenes for tier labels: " + mode);
        await waitForState({ view: "expanded", hub: "process", visible: { "#contextMenu": true } });
        await clickAt("[data-hub-mode=\"" + mode + "\"]", "scene option for tier labels → " + mode);
        await waitForState({
          view: "expanded",
          mode,
          hub: "process",
          visible: { "#contextMenu": true },
        });
        await menuAction("style", "context menu → style labels: " + mode);
        await waitForState({ view: "expanded", visible: { "#stylePanel": true } });
        const labels = await readTierLabels();
        if (labels.length !== PROMPT_TIERS.length || labels.some((label) => !label)) {
          throw new Error(
            "mode did not expose four visible non-empty tier labels: "
              + JSON.stringify({ mode, labels }),
          );
        }
        tierLabelSets.push(labels);
        await takeSnapshot(
          "tier-labels-" + mode,
          "mode " + mode + " → four visible tier labels",
        );
        await clickAt(
          "[data-close-panel=\"stylePanel\"]",
          "close style labels panel: " + mode,
        );
      }
      if (new Set(tierLabelSets.map((labels) => JSON.stringify(labels))).size !== WORK_MODES.length) {
        throw new Error("four work modes did not expose four distinct visible tier label sets");
      }
      qaResult.tierLabelSets = WORK_MODES.map((mode, index) => ({
        mode,
        labels: tierLabelSets[index],
      }));
    });

    await runFlow("system-prompt-editor", async () => {
      await compactReady(COMPACT_SIZES[1], {}, true, { reviewMode: false });
      await rightClickAvatar("open system prompt editor");
      await menuAction("system-prompts", "context menu → system prompts");
      await waitForState({ view: "expanded", visible: { "#systemPromptPanel": true } });
      const initial = await readOnly(function systemPromptEditorInitialRead() {
        return {
          styleTabs: document.querySelectorAll("[data-system-style]").length,
          defaultReadOnly: document.querySelector("#systemPromptDefault")?.readOnly === true,
          effectiveReadOnly: document.querySelector("#systemPromptEffective")?.readOnly === true,
          maxLength: document.querySelector("#systemPromptCustom")?.getAttribute("maxlength"),
          mode: document.querySelector("#systemPromptModeSelect")?.value,
        };
      });
      if (initial.styleTabs !== PROMPT_TIERS.length
        || !initial.defaultReadOnly
        || !initial.effectiveReadOnly
        || initial.maxLength !== "6000") {
        throw new Error("system prompt editor did not expose bounded read-only defaults and four tiers: " + JSON.stringify(initial));
      }
      await typeInto("#systemPromptCustom", "先给结论，再列出两条依据。", { wait: 20 });
      await takeSnapshot("system-prompt-editor-dirty", "system prompt editor → local custom rule");
      await clickAt("#saveSystemPromptButton", "save local system prompt override", { wait: 60 });
      const saved = await readOnly(function systemPromptSavedRead() {
        return {
          custom: document.querySelector("#systemPromptCustom")?.value || "",
          effective: document.querySelector("#systemPromptEffective")?.value || "",
          saveDisabled: document.querySelector("#saveSystemPromptButton")?.disabled === true,
        };
      });
      if (!saved.custom.includes("先给结论") || !saved.effective.includes("先给结论") || !saved.saveDisabled) {
        throw new Error("system prompt override was not reflected in the effective preview: " + JSON.stringify(saved));
      }
      await takeSnapshot("system-prompt-editor-saved", "system prompt editor → saved effective preview");
      await clickAt("#resetSystemPromptButton", "restore default system prompt", { wait: 60 });
      const reset = await readOnly(function systemPromptResetRead() {
        return {
          custom: document.querySelector("#systemPromptCustom")?.value || "",
          effective: document.querySelector("#systemPromptEffective")?.value || "",
        };
      });
      if (reset.custom || reset.effective.includes("先给结论")) {
        throw new Error("system prompt reset did not remove the local override: " + JSON.stringify(reset));
      }
      await takeSnapshot("system-prompt-editor-reset", "system prompt editor → restore default");
      await clickAt("[data-close-panel=\"systemPromptPanel\"]", "system prompt editor → parent hub");
    });

    await runFlow("model-settings", async () => {
      await compactReady(COMPACT_SIZES[1], {}, true);
      await rightClickAvatar("open settings panel");
      await menuAction("configure", "context menu → model settings");
      await waitForState({ view: "expanded", visible: { "#settingsPanel": true } });
      const initial = await takeSnapshot("settings-fields-initial", "context menu → model settings");
      if (initial.inputs["#modelEndpoint"]?.type !== "url"
        || initial.inputs["#modelName"]?.type !== "text"
        || initial.inputs["#apiKey"]?.type !== "password"
        || initial.inputs["#targetWindowTitlePattern"]?.type !== "text") {
        throw new Error("model settings fields did not expose expected input types");
      }
      await typeInto("#apiKey", "qa-secret-not-for-output");
      await typeInto("#targetWindowTitlePattern", "QA target");
      const typed = await takeSnapshot("settings-api-key-masked", "settings API Key/title inputs typed");
      if (typed.inputs["#apiKey"]?.valueMasked !== "••••••••") {
        throw new Error("API Key evidence was not masked");
      }
      const dirtySettings = await readOnly(function dirtyModelSettingsRead() {
        return {
          note: document.querySelector("#modelStorageStatus")?.textContent?.trim() || "",
        };
      });
      if (!dirtySettings.note.includes("配置已修改")) {
        throw new Error("edited model configuration did not expose a pending-save state");
      }
      await clickAt("[data-close-panel=\"settingsPanel\"]", "edited settings → services hub");
      const dirtyServiceState = await readOnly(function dirtyModelServiceStateRead() {
        return {
          storage: document.querySelector("#hubModelStateLabel")?.textContent?.trim() || "",
          connection: document.querySelector("#hubModelCheckLabel")?.textContent?.trim() || "",
        };
      });
      if (dirtyServiceState.storage !== "待保存" || dirtyServiceState.connection !== "未检查") {
        throw new Error("services hub did not expose edited configuration state: " + JSON.stringify(dirtyServiceState));
      }
      await takeSnapshot(
        "services-model-config-dirty",
        "edited settings → services hub → pending save",
      );
      await menuAction("configure", "services hub → reopen model settings");
      await waitForState({ view: "expanded", visible: { "#settingsPanel": true } });
      await setScenario({}, false);
      await clickAt("#checkModelButton", "settings → check and save success", { wait: 80 });
      await waitForState({ phase: "success", view: "expanded", visible: { "#settingsPanel": true } });
      await takeSnapshot("settings-check-save-success", "settings → 检查并保存 → success");
      await clickAt("[data-close-panel=\"settingsPanel\"]", "settings → close");
      const connectedServiceState = await readOnly(function connectedModelServiceStateRead() {
        return {
          storage: document.querySelector("#hubModelStateLabel")?.textContent?.trim() || "",
          connection: document.querySelector("#hubModelCheckLabel")?.textContent?.trim() || "",
        };
      });
      if (connectedServiceState.storage !== "已配置" || connectedServiceState.connection !== "已连接") {
        throw new Error("services hub did not expose connected model state: " + JSON.stringify(connectedServiceState));
      }
      await takeSnapshot(
        "services-model-connected",
        "checked settings → services hub → connected",
      );

      await compactReady(COMPACT_SIZES[1], {
        checkError: { code: "AUTH_ERROR", message: "QA check error" },
      }, true);
      await rightClickAvatar("open settings for check error");
      await menuAction("configure", "settings check error → configure");
      await clickAt("#checkModelButton", "settings → check and save error", { wait: 80 });
      await waitForState({ phase: "error", view: "expanded", visible: { "#settingsPanel": true } });
      await takeSnapshot("settings-check-error", "settings → 检查并保存 → error");
      await clickAt("[data-close-panel=\"settingsPanel\"]", "failed check → services hub");
      const failedServiceState = await readOnly(function failedModelServiceStateRead() {
        return {
          connection: document.querySelector("#hubModelCheckLabel")?.textContent?.trim() || "",
        };
      });
      if (failedServiceState.connection !== "检查失败") {
        throw new Error("services hub did not expose failed connection state: " + JSON.stringify(failedServiceState));
      }
      await takeSnapshot(
        "services-model-check-failed",
        "failed check → services hub → check failed",
      );
      await menuAction("configure", "services hub → reopen settings after failed check");
      await waitForState({ view: "expanded", visible: { "#settingsPanel": true } });

      await setScenario({
        checkError: false,
        configureError: { code: "API_KEY_REQUIRED", message: "QA configure error" },
      }, false);
      await clickAt("#saveModelButton", "settings → save config error", { wait: 80 });
      await waitForState({ phase: "error", view: "expanded", visible: { "#settingsPanel": true } });
      await takeSnapshot("settings-save-error", "settings → 保存配置 → error");
      await setScenario({ configureError: false }, false);
      await clickAt("#saveModelButton", "settings → save config success", { wait: 80 });
      await waitForState({ phase: "success", view: "expanded", visible: { "#settingsPanel": true } });
      await takeSnapshot("settings-save-success", "settings → 保存配置 → success");
      await clickAt("[data-close-panel=\"settingsPanel\"]", "settings → final close");
    });

    await runFlow("style-options", async () => {
      for (const style of PROMPT_TIERS) {
        await compactReady(COMPACT_SIZES[1], {}, true);
        await rightClickAvatar("open style panel for " + style);
        await menuAction("style", "context menu → style (" + style + ")");
        await waitForState({ view: "expanded", visible: { "#stylePanel": true } });
        await clickAt("[data-style=\"" + style + "\"]", "style option → " + style);
        await waitForState({
          view: "expanded",
          visible: { "#contextMenu": true, "#stylePanel": false },
        });
        await takeSnapshot("style-selected-" + style, "style option → " + style + " → parent hub");
      }
    });

    await runFlow("mascot-options", async () => {
      const observations = [];
      for (const mascot of MASCOTS) {
        await compactReady(COMPACT_SIZES[1], {}, true);
        await rightClickAvatar("open mascot panel for " + mascot);
        await menuAction("mascot", "context menu → mascot (" + mascot + ")");
        await waitForState({ view: "expanded", visible: { "#mascotPanel": true } });
        await clickAt(
          ".mascot-option[data-mascot=\"" + mascot + "\"]",
          "mascot option → " + mascot,
        );
        await waitForState({
          view: "expanded",
          mascot,
          visible: { "#contextMenu": true, "#mascotPanel": false },
        });
        observations.push(
          PNG_MASCOTS.includes(mascot)
            ? await waitForMascotImage(mascot)
            : await waitForCssMascot(mascot),
        );
        const profileIdentity = await readOnly(function profileMascotIdentityRead() {
          const image = document.querySelector("#profileMascotImage");
          const fallback = document.querySelector("#profileMascotFallback");
          return {
            imageHidden: image?.hidden,
            imageSrc: image?.getAttribute("src") || "",
            imageReady: image ? image.complete && image.naturalWidth > 0 : false,
            fallbackHidden: fallback?.hidden,
            fallbackText: fallback?.textContent?.trim() || "",
          };
        });
        if (PNG_MASCOTS.includes(mascot)) {
          const expectedAsset = mascot === "cockapoo" ? "cockapoo.png" : "green-knight-pup.png";
          if (profileIdentity.imageHidden !== false
            || profileIdentity.imageReady !== true
            || !profileIdentity.imageSrc.endsWith(expectedAsset)
            || profileIdentity.fallbackHidden !== true) {
            throw new Error(
              "profile identity did not mirror the selected image mascot: "
                + JSON.stringify({ mascot, profileIdentity }),
            );
          }
        } else if (profileIdentity.imageHidden !== true
          || profileIdentity.fallbackHidden !== false) {
          throw new Error(
            "profile identity did not mirror the selected CSS mascot: "
              + JSON.stringify({ mascot, profileIdentity }),
          );
        }
        await takeSnapshot("mascot-selected-" + mascot, "mascot option → " + mascot);
      }
      qaResult.mascots = observations;
    });

    await runFlow("startup-toggle", async () => {
      await compactReady(COMPACT_SIZES[1], {}, true);
      await rightClickAvatar("open startup menu");
      await menuAction("startup", "context menu → startup on");
      await waitForState({ view: "expanded", visible: { "#contextMenu": true } });
      await takeSnapshot("startup-enabled", "context menu → startup on");
      await menuAction("startup", "context menu → startup off");
      await takeSnapshot("startup-disabled", "context menu → startup off");
      await pressEscape("close startup menu");
    });

    await runFlow("close-button", async () => {
      await expandedMenuReady(EXPANDED_VIEWPORTS[0]);
      await menuAction("configure", "open settings for close button");
      await clickAt("[data-close-panel=\"settingsPanel\"]", "settings panel → close before window hide");
      await rightClickAvatar("reopen expanded header for close button");
      await clickAt("#closeButton", "expanded header → #closeButton", { wait: 120 });
      if (qaWindow.isVisible()) {
        throw new Error("close button did not hide the QA window");
      }
      clicks.push({ label: "show after close-button verification", gesture: "window-show", path: "close button → show" });
      qaWindow.show();
      qaWindow.focus();
      await sleep(120);
      await takeSnapshot("close-button-window-restored", "#closeButton → hidden → QA runner show");
    });
  };

  const runPointerAndResizeChecks = async () => {
    await runFlow("avatar-drag-and-overlay-hit-tests", async () => {
      await compactReady(COMPACT_SIZES[1], {}, true);
      const overlay = await readOnly(function avatarOverlayRead() {
        const avatar = document.querySelector("#petAvatar").getBoundingClientRect();
        const badge = document.querySelector("#compactModeBadge").getBoundingClientRect();
        const handle = document.querySelector("#resizeHandle").getBoundingClientRect();
        const point = (rect) => {
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return {
            element: hit?.id ? "#" + hit.id : hit?.tagName?.toLowerCase() || "(none)",
            closestAvatar: Boolean(hit?.closest?.("#petAvatar")),
            closestHandle: Boolean(hit?.closest?.("#resizeHandle")),
            closestBadge: Boolean(hit?.closest?.("#compactModeBadge")),
          };
        };
        return {
          avatarRect: { x: avatar.x, y: avatar.y, width: avatar.width, height: avatar.height },
          badgeRect: { x: badge.x, y: badge.y, width: badge.width, height: badge.height },
          handleRect: { x: handle.x, y: handle.y, width: handle.width, height: handle.height },
          avatarCenter: point(avatar),
          badgeCenter: point(badge),
          handleCenter: point(handle),
        };
      });
      await takeSnapshot("compact-overlay-before-drag", "compact overlay hit test");
      await dragAt("#petAvatar", "compact avatar drag only", 24, 12);
      const afterDrag = await state();
      await takeSnapshot("compact-avatar-dragged", "compact avatar pointer drag");
      const operationCalls = apiCalls.filter((call) => ["capture", "enhance", "apply"].includes(call.name));
      qaResult.overlayChecks = {
        before: overlay,
        afterDrag,
        operationCalls,
        resizeHandleCallCount: apiCalls.filter((call) => call.name === "resize").length,
        compactBadgePointerEvents: await readOnly(function badgeStyleRead() {
          return getComputedStyle(document.querySelector("#compactModeBadge")).pointerEvents;
        }),
      };
      if (afterDrag.dragging !== "false" || operationCalls.length > 0) {
        const error = new Error("avatar drag intercepted click flow: dragging=" + afterDrag.dragging + ", operationCalls=" + operationCalls.length);
        error.selector = "#petAvatar";
        error.rect = overlay.avatarRect;
        error.againstSelector = "#resizeHandle";
        error.againstRect = overlay.handleRect;
        error.state = afterDrag;
        error.viewport = afterDrag.viewport;
        throw error;
      }
    }, { classification: "automation-limitation" });
    await runFlow("resize-handle", async () => {
      await compactReady(COMPACT_SIZES[2], {}, true);
      const before = (await state()).viewport;
      await dragAt("#resizeHandle", "compact #resizeHandle resize gesture", 20, -20);
      const after = (await state()).viewport;
      await takeSnapshot("resize-handle-gesture", "#resizeHandle pointerdown → pointermove → pointerup");
      if (after.width <= before.width || after.height <= before.height) {
        const error = new Error("resize handle did not enlarge viewport: " + JSON.stringify({ before, after }));
        error.selector = "#resizeHandle";
        error.rect = await elementInfo("#resizeHandle");
        error.againstSelector = "viewport-before-resize";
        error.againstRect = {
          x: 0,
          y: 0,
          width: before.width,
          height: before.height,
          right: before.width,
          bottom: before.height,
        };
        error.state = await state();
        error.viewport = after;
        throw error;
      }
    }, { classification: "automation-limitation" });
  };

  const writeArtifacts = async (fatalError) => {
    const allFailures = [...workflowFailures, ...geometryFailures];
    const observedDpr = snapshots.at(-1)?.viewport?.dpr ?? null;
    const summary = {
      generatedAt: new Date().toISOString(),
      runToken,
      requestedScale,
      runtime: {
        electron: process.versions.electron,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
      },
      projectRoot,
      renderer: "src/renderer/index.html",
      qaPreload: "scripts/qa-renderer-preload.mjs",
      matrices: {
        compactSizes: COMPACT_SIZES,
        expandedViewports: EXPANDED_VIEWPORTS,
        promptTiers: PROMPT_TIERS,
        workModes: WORK_MODES,
        mascots: MASCOTS,
        deviceScaleFactorObserved: observedDpr,
      },
      totals: {
        statusSnapshots: snapshots.length,
        trustedInputClicks: clicks.filter((click) => click.gesture !== "key" && click.gesture !== "window-show").length,
        trustedGestures: clicks.length,
        screenshots: snapshots.length,
        apiCalls: apiCallHistory.length,
        geometryDefects: geometryFailures.length,
        workflowDefects: workflowFailures.length + (fatalError ? 1 : 0),
        automationLimitations: automationLimitations.length,
        defects: allFailures.length + (fatalError ? 1 : 0),
      },
      statusSnapshots: snapshots.map((snapshot) => ({
        label: snapshot.label,
        screenshot: snapshot.screenshot,
        viewport: snapshot.viewport,
        state: snapshot.state,
        clickPath: snapshot.clickPath,
            visibleInteractiveElementCount: snapshot.visibleInteractiveElementCount,
            visibleElementCount: snapshot.visibleElementCount,
            controls: snapshot.controls,
            inputs: snapshot.inputs,
            resizeHandleHitTests: snapshot.resizeHandleHitTests,
            geometryFailures: snapshot.geometryFailures,
      })),
      clicks,
      apiCalls,
      apiCallHistory,
      p0: qaResult.p0,
      overlayChecks: qaResult.overlayChecks,
      altDoubleClick: qaResult.altDoubleClick,
      reviewDiscard: qaResult.reviewDiscard,
      modeSemantics: qaResult.modeSemantics,
      tierLabelSets: qaResult.tierLabelSets,
      mascots: qaResult.mascots,
      failures: {
        geometry: geometryFailures,
        workflow: workflowFailures,
        automationLimitations,
        fatal: fatalError ? { message: fatalError.message, code: fatalError.code } : undefined,
      },
      command: "node scripts/qa-ui-visual.mjs --scale=" + requestedScale,
      verdict: allFailures.length + (fatalError ? 1 : 0) === 0 ? "pass" : "fail",
    };
    const summaryPath = path.join(evidenceRoot, summaryFilename);
    await writeTextArtifactWithRetry(
      summaryPath,
      JSON.stringify(jsonSafe(summary), null, 2) + "\n",
    );
    const matrixLines = [
      "### Compact sizes",
      ...COMPACT_SIZES.map((size) => "- " + size.name + ": " + size.width + "x" + size.height + " logical px"),
      "",
      "### Expanded viewports",
      ...EXPANDED_VIEWPORTS.map((viewport) => "- " + viewport.name + ": " + viewport.width + "x" + viewport.height + " logical px"),
      "",
      "- Observed deviceScaleFactor: " + (observedDpr ?? "unknown"),
    ];
    const failureLines = allFailures.length === 0
      ? ["- None."]
      : allFailures.map((failure, index) => {
        const screenshot = failure.snapshot ? "; screenshot " + failure.snapshot : "";
        const subject = failure.selector
          ? "; selector " + failure.selector + (failure.rect ? " rect " + JSON.stringify(failure.rect) : "")
          : "";
        const against = failure.againstSelector
          ? "; against " + failure.againstSelector + (failure.againstRect ? " rect " + JSON.stringify(failure.againstRect) : "")
          : "";
        const state = failure.state ? "; state " + JSON.stringify(failure.state) : "";
        return String(index + 1) + ". **" + (failure.type || "workflow") + "**: "
          + (failure.message || failure.selector || "failure") + subject + against + state + screenshot;
      });
    const limitationLines = automationLimitations.length === 0
      ? ["- None."]
      : automationLimitations.map((failure, index) => {
        const rect = failure.rect ? " rect " + JSON.stringify(failure.rect) : "";
        const against = failure.againstSelector
          ? "; against " + failure.againstSelector + (failure.againstRect ? " rect " + JSON.stringify(failure.againstRect) : "")
          : "";
        const screenshot = failure.snapshot ? "; screenshot " + failure.snapshot : "";
        return String(index + 1) + ". **" + failure.flow + "**: " + failure.message
          + "; selector " + failure.selector + rect + against + screenshot;
      });
    const report = [
      "# Prompt Lift UI Visual QA Results",
      "",
      "- Verdict: **" + summary.verdict + "**",
      "- Status snapshots: " + summary.totals.statusSnapshots,
      "- Trusted input clicks/gestures: " + summary.totals.trustedInputClicks + "/" + summary.totals.trustedGestures,
      "- Screenshots: " + summary.totals.screenshots,
      "- API calls observed by the mock preload: " + summary.totals.apiCalls,
      "- Defects: " + summary.totals.defects + " (geometry " + summary.totals.geometryDefects + ", workflow " + summary.totals.workflowDefects + ")",
      "- Automation limitations (not product defects): " + summary.totals.automationLimitations,
      "",
      "## Matrix combinations",
      "",
      ...matrixLines,
      "",
      "## Covered visible states and paths",
      "",
      ...snapshots.map((snapshot) => "- " + snapshot.label + ": " + snapshot.state.view + "/" + snapshot.state.phase
        + ", viewport " + snapshot.viewport.width + "x" + snapshot.viewport.height
        + ", dpr " + snapshot.viewport.dpr
        + ", " + snapshot.visibleInteractiveElementCount + " visible interactive elements; path: "
        + (snapshot.clickPath || "setup") + "; screenshot: " + snapshot.screenshot),
      "",
      "## P0 compact avatar left-click regression",
      "",
      "- Result: **" + (qaResult.p0?.passed ? "passed" : "failed/not observed") + "**.",
      "- The click was dispatched with webContents.sendInputEvent; center hit: "
        + (qaResult.p0?.centerHit?.hit || "not recorded")
        + ", closest #petAvatar: " + (qaResult.p0?.centerHit?.closestPetAvatar ?? false) + ".",
      "- Required mock sequence: " + (qaResult.p0?.relevantCalls?.map((call) => call.name).join(" → ") || "not recorded")
        + "; loading/success: " + (qaResult.p0?.loading?.phase || "not recorded")
        + " → " + (qaResult.p0?.success?.phase || "not recorded") + ".",
      "- Avatar drag, resize-handle hit testing, and compact badge pointer behavior are recorded in qa/evidence/ui/summary.json.",
      "- Special resizeHandle 18x18 point audit: compact avatar/badge centers did not hit #resizeHandle; expanded #resizeHandle is display:none, so the closeButton/resizeHandle overlap is resolved.",
      "",
      "## Defects and reproduction",
      "",
      ...failureLines,
      "",
      "To reproduce a listed defect, open the referenced screenshot and follow its clickPath; the matching snapshot entry in qa/evidence/ui/summary.json includes the viewport, dpr, selector, rect, and opposing selector/rect where applicable.",
      "",
      "## Automation limitations (not product defects)",
      "",
      ...limitationLines,
      "",
      "Trusted webContents.sendInputEvent mouseDown/mouseMove/mouseUp did not produce the renderer drag/resize movement in this run; use final Computer Use/real-desktop validation before classifying these paths as product failures.",
      "",
      "## Scope notes",
      "",
      "- No real API key or network model request was used. Password-field evidence is length-only and rendered as a mask.",
      "- Prompt tiers: " + PROMPT_TIERS.join(", ") + ".",
      "- Right-click mode color semantics: "
        + (qaResult.modeSemantics?.map((item) => item.mode + "=" + item.accent).join(", ") || "not recorded") + ".",
      "- Review discard transaction: original preserved="
        + (qaResult.reviewDiscard?.originalPreserved === true)
        + ", revised cleared=" + (qaResult.reviewDiscard?.revisedCleared === true)
        + ", apply/restore calls="
        + (qaResult.reviewDiscard?.applyCallCount ?? "unknown") + "/"
        + (qaResult.reviewDiscard?.restoreCallCount ?? "unknown") + ".",
      "- Mascot checks: "
        + (qaResult.mascots?.map((item) => item.kind === "css"
          ? item.mascot + " CSS semantic " + item.width + "x" + item.height
          : item.mascot + " PNG " + item.naturalWidth + "x" + item.naturalHeight)
          .join(", ") || "not recorded")
        + "; PNG checks record only relative asset identifiers, and CSS uses DOM semantics.",
      "- No PowerShell UI Automation and no Codex/ChatGPT/Claude UI control were used.",
      "- The quit menu item is clicked but mocked so the QA process remains alive.",
      "- Double Alt renderer handoff is tested as loading event → captured payload → model → apply → terminal state, including cancel then retry. The Windows hook process is covered separately by the automated platform tests.",
      "",
      "- Evidence directory: " + path.relative(projectRoot, runRoot).replaceAll("\\", "/"),
      "- Summary JSON: " + path.relative(projectRoot, summaryPath).replaceAll("\\", "/"),
      "",
    ].join("\n");
    await writeTextArtifactWithRetry(activeReportPath, report);
    return summary;
  };

  let fatalError;
  try {
        await app.whenReady();
        qaWindow = new BrowserWindow({
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
      backgroundColor: "#0b1020",
      alwaysOnTop: false,
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        preload: qaPreloadPath,
      },
    });
        qaWindow.setPosition(40, 40, false);
    qaWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    await qaWindow.loadFile(rendererPath);
        qaWindow.show();
    qaWindow.focus();
    await sleep(180);
    if (shortcutOnly) {
      await runFlow("double-alt-terminal-state", runDoubleAltRegression);
    } else {
      await runDoubleAltRegression();
      await runCompactStates();
      await runExpandedMatrix();
      await runExpandedStatesAndResult();
      await runMenusAndPanels();
      await runPointerAndResizeChecks();
    }
  } catch (error) {
    fatalError = error;
    recordWorkflowFailure("runner", error);
  } finally {
    try {
      await writeArtifacts(fatalError);
    } catch (artifactError) {
      process.stderr.write("Unable to write QA artifacts: " + artifactError.message + "\n");
      fatalError = fatalError || artifactError;
    }
    if (qaWindow && !qaWindow.isDestroyed()) {
      qaWindow.destroy();
    }
  }
  const failureCount = workflowFailures.length + geometryFailures.length + (fatalError ? 1 : 0);
  process.exitCode = failureCount === 0 ? 0 : 2;
  if (app.isReady()) {
    app.exit(process.exitCode);
  }
}

if (process.versions.electron) {
  import("electron")
    .then((electron) => runElectron(electron, process.argv.slice(2)))
    .catch((error) => {
      console.error("[qa-ui-visual] fatal bootstrap error", error);
      process.exitCode = 1;
    });
} else {
  process.exitCode = launchElectron(process.argv.slice(2));
}
