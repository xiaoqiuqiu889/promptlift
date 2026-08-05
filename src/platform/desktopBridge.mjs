import * as macBridge from "./macBridge.mjs";
import * as windowsBridge from "./windowsBridge.mjs";

const bridge = process.platform === "darwin" ? macBridge : windowsBridge;

export const capturePrompt = bridge.capturePrompt;
export const copyText = bridge.copyText;
export const getForegroundTarget = bridge.getForegroundTarget;
export const replacePrompt = bridge.replacePrompt;
