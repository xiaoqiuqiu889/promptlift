import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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
    return {
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
      right: round(rect.right),
      bottom: round(rect.bottom),
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
      for (const [attribute, property] of [["menu-action", "menuAction"], ["mode", "mode"], ["style", "style"], ["close-panel", "closePanel"]]) {
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
  const overlaySelectors = ["#contextMenu", "#modePanel", "#settingsPanel", "#stylePanel", "#resultPanel"];
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
    const scrollContainer = item.element.closest(".pet-card");
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
  for (const selector of ["#contextMenu", "#modePanel", "#settingsPanel", "#stylePanel"]) {
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
  for (const selector of ["#modePanel", "#settingsPanel", "#stylePanel"]) {
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
    resizing: root?.dataset.resizing || "false",
    dragging: root?.dataset.dragging || "false",
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    visible: Object.fromEntries([
      "#contextMenu", "#modePanel", "#settingsPanel", "#stylePanel", "#resultPanel",
      "#resultMenuButton", "#compactFeedback", "#compactCancelButton", "#collapseButton", "#closeButton",
    ].map((selector) => [selector, visible(selector)])),
    controls: Object.fromEntries([
      "#cancelButton", "#restoreButton", "#copyButton", "#compactCancelButton",
      "#resizeHandle", "#compactModeBadge",
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
        const mode = element.closest?.("[data-mode]")?.dataset.mode;
        if (mode) {
          return "[data-mode=\"" + mode + "\"]";
        }
        const style = element.closest?.("[data-style]")?.dataset.style;
        if (style) {
          return "[data-style=\"" + style + "\"]";
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
    const info = await elementInfo(selector);
    if (!info || info.hidden || info.display === "none" || info.visibility === "hidden"
      || info.width <= 0 || info.height <= 0) {
      throw new Error("cannot click hidden element " + selector);
    }
    const page = await state();
    const x = Math.max(1, Math.min(Math.round(info.x + info.width / 2), Math.max(1, page.viewport.width - 1)));
    const y = Math.max(1, Math.min(Math.round(info.y + info.height / 2), Math.max(1, page.viewport.height - 1)));
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
        const mode = element.closest?.("[data-mode]")?.dataset.mode;
        if (mode) {
          return "[data-mode=\"" + mode + "\"]";
        }
        const style = element.closest?.("[data-style]")?.dataset.style;
        if (style) {
          return "[data-style=\"" + style + "\"]";
        }
        return element.tagName?.toLowerCase() || "element";
      };
      return {
        element: describe(target),
        closestTarget: Boolean(closest),
        closest: describe(closest),
      };
    };
    const hit = await readOnly(source.toString()
      .replaceAll("__X__", String(x))
      .replaceAll("__Y__", String(y))
      .replaceAll("\"__SELECTOR__\"", JSON.stringify(selector)));
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
  const compactReady = async (size, scenario, resetCalls = true) => {
    await reloadPage();
    await setScenario(scenario || {}, resetCalls);
    await setWindowSize(size.width, size.height);
    await waitForState({ phase: "idle", view: "compact" });
  };
  const expandedMenuReady = async (viewport) => {
    await compactReady(COMPACT_SIZES[1], {}, true);
    await rightClickAvatar("open context menu");
    await waitForState({ phase: "idle", view: "expanded", visible: { "#contextMenu": true } });
    await setWindowSize(viewport.width, viewport.height);
  };
  const menuAction = (action, label) => clickAt(
    "[data-menu-action=\"" + action + "\"]",
    label || "menu:" + action,
    { wait: 120 },
  );

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
    const firstSuccess = await waitForState({ phase: "success", view: "compact" });
    const firstCalls = apiCalls
      .filter((call) => ["setMode", "configure", "enhance", "apply"].includes(call.name))
      .map((call) => call.name);

    await compactReady(COMPACT_SIZES[1], { enhanceDelay: 1_200 }, true);
    await emitDoubleAltCapture("Double Alt cancellation run: keep number 84.");
    await waitForCall("enhance");
    await clickAt("#compactCancelButton", "double Alt loading → cancel", { wait: 50 });
    const cancelled = await waitForState({ phase: "idle", view: "compact" });

    await setScenario({}, true);
    await emitDoubleAltCapture("Double Alt retry after cancellation: keep number 126.");
    await waitForCall("enhance");
    await waitForCall("apply");
    const retrySuccess = await waitForState({ phase: "success", view: "compact" }, 4_000);
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
    await compactReady(COMPACT_SIZES[1], {}, true);
    const idle = await takeSnapshot("compact-idle-p0-before-left-click", "compact idle → #petAvatar left click");
    const click = await clickAt("#petAvatar", "P0 trusted left click #petAvatar", { wait: 50 });
    const loading = await waitForState({ phase: "loading", view: "compact" });
    await takeSnapshot("compact-loading-p0-avatar", "#petAvatar left click → loading");
    await waitForCall("capture");
    await waitForCall("enhance");
    await waitForCall("apply");
    const success = await waitForState({ phase: "success", view: "compact" });
    await takeSnapshot("compact-success-p0-avatar", "#petAvatar left click → capture → enhance → apply → success");
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
    const secondSuccess = await waitForState({ phase: "success", view: "compact" });
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

    await runFlow("result-panel-controls", async () => {
      await compactReady(COMPACT_SIZES[1], {}, true);
      await clickAt("#petAvatar", "create result for result panel", { wait: 50 });
      await waitForState({ phase: "success", view: "compact" });
      await rightClickAvatar("open result context menu");
      await waitForState({ phase: "success", view: "expanded", visible: { "#contextMenu": true, "#resultMenuButton": true } });
      await menuAction("result", "context menu → view result");
      await waitForState({ phase: "success", view: "expanded", visible: { "#resultPanel": true } });
      const successControls = await takeSnapshot("expanded-success-result-controls", "context menu → view result");
      await clickAt("#copyButton", "result panel → #copyButton enabled", { wait: 100 });
      await takeSnapshot("result-copy-success", "result panel → #copyButton");
      await clickAt("#restoreButton", "result panel → #restoreButton enabled", { wait: 100 });
      await waitForState({ phase: "success", view: "expanded", visible: { "#resultPanel": false } });
      await takeSnapshot("result-restore-success", "result panel → #restoreButton");
      if (successControls.controls["#cancelButton"]?.disabled !== true
        || successControls.controls["#restoreButton"]?.disabled !== false
        || successControls.controls["#copyButton"]?.disabled !== false) {
        throw new Error("result button enabled/disabled contract did not match success state");
      }
    });

    await runFlow("result-panel-loading-cancel-disabled", async () => {
      await compactReady(COMPACT_SIZES[1], { applyDelay: 4_000 }, true);
      await clickAt("#petAvatar", "create delayed result", { wait: 40 });
      await waitForState({ phase: "loading", view: "compact" });
      await waitForCall("enhance");
      await sleep(150);
      await rightClickAvatar("open delayed-result context");
      await waitForState({ phase: "loading", view: "expanded", visible: { "#contextMenu": true, "#resultMenuButton": true } });
      await menuAction("result", "delayed result → view result");
      const loadingControls = await takeSnapshot("expanded-loading-result-controls", "delayed apply → context menu → view result");
      await clickAt("#cancelButton", "result panel → #cancelButton disabled", { wait: 50 });
      await waitForState({ phase: "success", view: "expanded", visible: { "#resultPanel": true } }, 4_000);
      await takeSnapshot("expanded-success-after-delayed-apply", "delayed apply → success");
      if (loadingControls.controls["#cancelButton"]?.disabled !== true) {
        throw new Error("result panel cancel button was not disabled while safe apply was in flight");
      }
    });

    await runFlow("expanded-collapse", async () => {
      await compactReady(COMPACT_SIZES[1], {}, true);
      await clickAt("#petAvatar", "create success before collapse", { wait: 50 });
      await waitForState({ phase: "success", view: "compact" });
      await rightClickAvatar("open success context before collapse");
      await menuAction("result", "open result before collapse");
      await waitForState({ phase: "success", view: "expanded", visible: { "#resultPanel": true } });
      await clickAt("#collapseButton", "expanded → #collapseButton");
      await waitForState({ phase: "success", view: "compact" });
      await takeSnapshot("compact-after-expanded-collapse", "expanded result → #collapseButton → compact");
    });
  };

  const runMenusAndPanels = async () => {
    await runFlow("context-menu-complete", async () => {
      for (const action of ["result", "mode", "configure", "style", "check", "startup", "quit"]) {
        await compactReady(COMPACT_SIZES[1], {}, true);
        if (action === "result") {
          await clickAt("#petAvatar", "create result for context result item", { wait: 50 });
          await waitForState({ phase: "success", view: "compact" });
        }
        await rightClickAvatar("reopen context for " + action);
        if (action === "result") {
          await waitForState({ view: "expanded", visible: { "#contextMenu": true, "#resultMenuButton": true } });
        } else {
          await waitForState({ view: "expanded", visible: { "#contextMenu": true } });
        }
        await takeSnapshot("context-menu-before-" + action, "trusted right click #petAvatar → " + action);
        await menuAction(action, "context menu → " + action);
        if (action === "quit") {
          await takeSnapshot("context-menu-quit-visible", "context menu → quit (mocked, process retained)");
          if (qaWindow.isDestroyed()) {
            throw new Error("mock quit unexpectedly destroyed QA window");
          }
        } else if (action === "result") {
          await waitForState({ view: "expanded", visible: { "#resultPanel": true } });
          await takeSnapshot("context-result-panel", "context menu → view result");
        } else if (action === "startup") {
          await waitForState({ view: "expanded", visible: { "#contextMenu": true } });
          await takeSnapshot("context-startup-visible", "context menu → startup");
          await pressEscape("close startup context menu");
        } else {
          const panel = action === "mode" ? "#modePanel" : action === "style" ? "#stylePanel" : "#settingsPanel";
          await waitForState({ view: "expanded", visible: { [panel]: true } });
          await takeSnapshot("context-" + action + "-panel", "context menu → " + action);
          await clickAt("[data-close-panel=\"" + panel.slice(1) + "\"]", action + " panel → close");
        }
      }
    });

    await runFlow("mode-options", async () => {
      const expectedModeFeedback = {
        enhance: "已切换：AI 提示词",
        "upward-communication": "已切换：向上沟通",
        "chat-polish": "已切换：用户沟通",
        "ppt-copy": "已切换：PPT 文案",
      };
      for (const mode of ["enhance", "upward-communication", "chat-polish", "ppt-copy"]) {
        await compactReady(COMPACT_SIZES[1], {}, true);
        await rightClickAvatar("open mode panel for " + mode);
        await menuAction("mode", "context menu → mode (" + mode + ")");
        await waitForState({ view: "expanded", visible: { "#modePanel": true } });
        await takeSnapshot("mode-panel-" + mode, "mode panel before " + mode);
        await clickAt("[data-mode=\"" + mode + "\"]", "mode option → " + mode);
        await waitForState({ view: "compact", visible: { "#modePanel": false } });
        const feedback = await elementInfo("#compactFeedbackText");
        if (feedback?.textContent !== expectedModeFeedback[mode]) {
          throw new Error(`compact mode feedback mismatch for ${mode}: ${feedback?.textContent}`);
        }
        await takeSnapshot("mode-selected-" + mode, "mode option → " + mode + " → close");
      }
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
      await setScenario({}, false);
      await clickAt("#checkModelButton", "settings → check and save success", { wait: 80 });
      await waitForState({ phase: "success", view: "expanded", visible: { "#settingsPanel": true } });
      await takeSnapshot("settings-check-save-success", "settings → 检查并保存 → success");
      await clickAt("[data-close-panel=\"settingsPanel\"]", "settings → close");

      await compactReady(COMPACT_SIZES[1], {
        checkError: { code: "AUTH_ERROR", message: "QA check error" },
      }, true);
      await rightClickAvatar("open settings for check error");
      await menuAction("configure", "settings check error → configure");
      await clickAt("#checkModelButton", "settings → check and save error", { wait: 80 });
      await waitForState({ phase: "error", view: "expanded", visible: { "#settingsPanel": true } });
      await takeSnapshot("settings-check-error", "settings → 检查并保存 → error");

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
      for (const style of ["faithful", "balanced", "concise", "detailed", "professional", "creative"]) {
        await compactReady(COMPACT_SIZES[1], {}, true);
        await rightClickAvatar("open style panel for " + style);
        await menuAction("style", "context menu → style (" + style + ")");
        await waitForState({ view: "expanded", visible: { "#stylePanel": true } });
        await clickAt("[data-style=\"" + style + "\"]", "style option → " + style);
        await waitForState({ view: "compact", visible: { "#stylePanel": false } });
        await takeSnapshot("style-selected-" + style, "style option → " + style + " → close");
      }
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
      failures: {
        geometry: geometryFailures,
        workflow: workflowFailures,
        automationLimitations,
        fatal: fatalError ? { message: fatalError.message, code: fatalError.code } : undefined,
      },
      command: "node scripts/qa-ui-visual.mjs --scale=" + requestedScale,
      verdict: allFailures.length + (fatalError ? 1 : 0) === 0 ? "pass" : "fail",
    };
    const summaryPath = path.join(evidenceRoot, "summary.json");
    await writeFile(summaryPath, JSON.stringify(jsonSafe(summary), null, 2) + "\n", "utf8");
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
      "- No PowerShell UI Automation and no Codex/ChatGPT/Claude UI control were used.",
      "- The quit menu item is clicked but mocked so the QA process remains alive.",
      "- Double Alt renderer handoff is tested as loading event → captured payload → model → apply → terminal state, including cancel then retry. The Windows hook process is covered separately by the automated platform tests.",
      "",
      "- Evidence directory: " + path.relative(projectRoot, runRoot).replaceAll("\\", "/"),
      "- Summary JSON: " + path.relative(projectRoot, summaryPath).replaceAll("\\", "/"),
      "",
    ].join("\n");
    await writeFile(reportPath, report, "utf8");
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
