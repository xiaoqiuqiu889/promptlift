const KNOWN_ERROR_CODES = new Set([
  "API_UNAVAILABLE",
  "API_KEY_REQUIRED",
  "API_KEY_STORAGE_UNAVAILABLE",
  "API_KEY_STORAGE_FAILED",
  "AUTH_ERROR",
  "MODEL_CONFIG_INVALID",
  "INVALID_ENDPOINT",
  "MODEL_REQUIRED",
  "STYLE_INVALID",
  "MODE_INVALID",
  "SHORTCUT_INVALID",
  "SHORTCUT_CONFLICT",
  "SHORTCUT_UNAVAILABLE",
  "SHORTCUT_SAVE_FAILED",
  "SYSTEM_PROMPT_SAVE_FAILED",
  "WINDOW_SIZE_INVALID",
  "NETWORK_ERROR",
  "HTTP_ERROR",
  "INVALID_JSON",
  "MISSING_RESULT",
  "MODEL_NEEDS_INPUT",
  "BRIDGE_TIMEOUT",
  "OPERATION_TIMEOUT",
  "TARGET_REQUIRED",
  "TARGET_INVALID",
  "WINDOW_NOT_FOUND",
  "TARGET_PATTERN_MISMATCH",
  "TARGET_CONTENT_CHANGED",
  "REPLACEMENT_CANCELLED",
  "REPLACEMENT_EXPIRED",
  "CLIPBOARD_UNAVAILABLE",
  "CLIPBOARD_RESTORE_FAILED",
  "REPLACE_NOT_CONFIRMED",
  "POWERSHELL_START_FAILED",
  "POWERSHELL_FAILED",
  "EMPTY_PROMPT",
  "PROMPT_NOT_CAPTURED",
  "EMPTY_RESULT",
  "CANCELLED",
  "TARGET_UNAVAILABLE",
  "INVALID_MODEL_OUTPUT",
  "MODEL_OUTPUT_META_PROMPT",
  "MODEL_OUTPUT_MODE_MISMATCH",
  "MODEL_OUTPUT_LANGUAGE_MISMATCH",
  "MODEL_OUTPUT_STATUS_MISMATCH",
  "MODEL_OUTPUT_TRUNCATED",
  "MODEL_OUTPUT_TOO_LONG",
  "MODEL_OUTPUT_FACT_LOSS",
  "MODEL_OUTPUT_SCOPE_INVENTION",
  "MODEL_OUTPUT_MULTIPLE_CANDIDATES",
  "MODEL_OUTPUT_SEMANTIC_ESCALATION",
  "MODEL_OUTPUT_PERMISSION_SEEKING",
  "MODEL_OUTPUT_FALSE_EXECUTION_CLAIM",
  "MODEL_OUTPUT_UNNECESSARY_CLARIFICATION",
  "MODEL_OUTPUT_TASK_INTENT_DRIFT",
  "MODEL_OUTPUT_OBJECT_DRIFT",
  "MODEL_OUTPUT_UNSUPPORTED_FACT",
]);

const ERROR_CODE_PATTERNS = Object.freeze([
  ["MODEL_OUTPUT_TOO_LONG", /模型改写结果异常膨胀|rewritten result expanded abnormally|output.{0,24}(?:too long|expanded)/iu],
  ["MODEL_OUTPUT_FACT_LOSS", /模型遗漏.*(?:数字|链接|路径|代码)|dropped (?:a )?(?:number|link|path|code)/iu],
  ["MODEL_OUTPUT_SCOPE_INVENTION", /模型新增.*(?:产品|平台|场景)|introduced (?:a )?(?:product|platform|scenario)/iu],
  ["MODEL_OUTPUT_SEMANTIC_ESCALATION", /模型结果.*(?:建议|可能性|否定|语气).*(?:改变|升级)|escalated (?:a )?(?:suggestion|possibility|negative|commitment)/iu],
  ["MODEL_OUTPUT_META_PROMPT", /二次改写|系统提示词|meta[- ]prompt|rewrite instructions/iu],
  ["MODEL_OUTPUT_MODE_MISMATCH", /错误的工作模式|wrong work mode/iu],
  ["MODEL_OUTPUT_LANGUAGE_MISMATCH", /没有跟随原文语言|did not follow the source language/iu],
  ["MODEL_OUTPUT_STATUS_MISMATCH", /标记.*未修改|marked changed text as unchanged/iu],
  ["MODEL_OUTPUT_TRUNCATED", /输出.*截断|truncated completion/iu],
  ["MODEL_OUTPUT_MULTIPLE_CANDIDATES", /多个候选|multiple candidate drafts|returned alternatives/iu],
  ["MODEL_OUTPUT_PERMISSION_SEEKING", /追加.*(?:是否|要不要|请确认)|permission[- ]seeking|should i proceed/iu],
  ["MODEL_OUTPUT_FALSE_EXECUTION_CLAIM", /伪造.*(?:完成|审计|检查)|fabricated.*(?:completed|audited|inspected)/iu],
  ["MODEL_OUTPUT_UNNECESSARY_CLARIFICATION", /不必要.*追问|unnecessary clarification/iu],
  ["MODEL_OUTPUT_TASK_INTENT_DRIFT", /核心任务动作|core task action/iu],
  ["MODEL_OUTPUT_OBJECT_DRIFT", /交付物类型|deliverable type/iu],
  ["MODEL_OUTPUT_UNSUPPORTED_FACT", /量化阈值|quantified target/iu],
  ["MISSING_RESULT", /响应缺少\s*result|missing (?:a )?result,?\s*(?:text|or content)/iu],
  ["MODE_INVALID", /提示词工作模式无效|工作模式无效|invalid (?:prompt )?work mode/iu],
]);

const ERROR_MESSAGES = Object.freeze({
  API_UNAVAILABLE: "助手连接失败：Prompt Pet 接口不可用。请重启应用后重试。",
  API_KEY_REQUIRED: "模型配置缺少 API Key：请在设置中保存 Key，或留空复用已保存的 Key。",
  API_KEY_STORAGE_UNAVAILABLE: "安全存储不可用：本次运行仍可使用，但 Key 不会持久保存。",
  API_KEY_STORAGE_FAILED: "Key 保存失败：模型仍可使用，请检查应用数据目录权限。",
  AUTH_ERROR: "模型认证失败：API Key 无效，或没有当前模型的访问权限。",
  MODEL_CONFIG_INVALID: "模型配置无效：请检查 API Base URL、模型名和 API Key。",
  INVALID_ENDPOINT: "API Base URL 无效：请检查地址格式。",
  MODEL_REQUIRED: "模型名称为空：请先填写模型名。",
  STYLE_INVALID: "优化档位无效：请重新选择档位。",
  MODE_INVALID: "表达场景无效：请重新选择场景。",
  SHORTCUT_INVALID: "快捷键组合无效：请重新录制。",
  SHORTCUT_CONFLICT: "快捷键已被其他应用占用：原快捷键仍然有效。",
  SHORTCUT_UNAVAILABLE: "快捷键监听暂不可用：原快捷键仍然有效。",
  SHORTCUT_SAVE_FAILED: "快捷键保存失败：原快捷键仍然有效。",
  SYSTEM_PROMPT_SAVE_FAILED: "系统提示词保存失败：默认规则仍然生效。",
  WINDOW_SIZE_INVALID: "窗口尺寸无效：请重新拖动右上角缩放区域。",
  NETWORK_ERROR: "模型网络请求失败：请检查网络或 API Base URL。",
  HTTP_ERROR: "模型服务返回请求错误：请稍后重试或检查服务状态。",
  INVALID_JSON: "模型返回格式错误：未读到合法 JSON，原文未改动。",
  MISSING_RESULT: "模型返回缺少结果字段：原文未改动。",
  MODEL_NEEDS_INPUT: "任务信息不足：请补充任务对象或必要上下文。",
  BRIDGE_TIMEOUT: "读取目标输入框超时：原文未改动。",
  OPERATION_TIMEOUT: "处理超时：本次操作已结束，原文未改动。",
  TARGET_REQUIRED: "没有可用的目标输入框：请先聚焦目标应用的输入框。",
  TARGET_INVALID: "目标输入框标识无效：请重新聚焦后重试。",
  WINDOW_NOT_FOUND: "找不到目标窗口：请先打开并聚焦目标应用。",
  TARGET_PATTERN_MISMATCH: "目标窗口与标题关键词不匹配：请重新聚焦正确窗口。",
  TARGET_CONTENT_CHANGED: "目标输入框内容已变化：为保护新内容，本次回填已取消。",
  REPLACEMENT_CANCELLED: "本次回填已取消或失效：原文未改动。",
  REPLACEMENT_EXPIRED: "本次回填已过期：请重新读取输入框后再试。",
  CLIPBOARD_UNAVAILABLE: "剪贴板不可用：请关闭占用剪贴板的程序后重试。",
  CLIPBOARD_RESTORE_FAILED: "剪贴板恢复失败：请检查是否有程序持续占用剪贴板。",
  REPLACE_NOT_CONFIRMED: "回填校验未通过：目标输入框未确认收到增强结果，原文未改动。增强结果已保留，可复制后手动粘贴。",
  POWERSHELL_START_FAILED: "Windows 桥接启动失败：请确认目标应用运行在桌面环境。",
  POWERSHELL_FAILED: "Windows 桥接执行失败：请重新聚焦目标输入框后重试。",
  EMPTY_PROMPT: "目标输入框为空：请先输入内容。",
  PROMPT_NOT_CAPTURED: "未读到目标输入框：请先聚焦 Codex、Claude 或其他目标输入框。",
  EMPTY_RESULT: "模型没有返回可用内容：原文未改动。",
  CANCELLED: "本次操作已取消：原文未改动。",
  TARGET_UNAVAILABLE: "增强结果或目标输入框不可用：请重新读取内容。",
  INVALID_MODEL_OUTPUT: "模型结果格式不符合协议：原文未改动。",
  MODEL_OUTPUT_META_PROMPT: "模型返回了二次改写指令或系统规则，而不是最终结果：原文未改动。",
  MODEL_OUTPUT_MODE_MISMATCH: "模型返回了错误的表达场景：原文未改动。",
  MODEL_OUTPUT_LANGUAGE_MISMATCH: "模型返回语言与原文不一致：原文未改动。",
  MODEL_OUTPUT_STATUS_MISMATCH: "模型错误标记了结果状态：原文未改动。",
  MODEL_OUTPUT_TRUNCATED: "模型结果被截断：原文未改动，请重试。",
  MODEL_OUTPUT_TOO_LONG: "模型结果过长：超过当前档位长度上限，原文未改动。请缩短原文或切换更高档位。",
  MODEL_OUTPUT_FACT_LOSS: "模型结果遗漏了原文事实锚点（数字、链接、路径或代码）：原文未改动。",
  MODEL_OUTPUT_SCOPE_INVENTION: "模型结果新增了原文没有的产品、平台或应用场景：原文未改动。",
  MODEL_OUTPUT_MULTIPLE_CANDIDATES: "模型返回了多个候选结果，而不是一个最终结果：原文未改动。",
  MODEL_OUTPUT_SEMANTIC_ESCALATION: "模型改变了原文的建议、可能性、否定或承诺强度：原文未改动。",
  MODEL_OUTPUT_PERMISSION_SEEKING: "模型追加了不必要的确认或继续询问：原文未改动。",
  MODEL_OUTPUT_FALSE_EXECUTION_CLAIM: "模型把待执行任务误写成已完成事实：原文未改动。",
  MODEL_OUTPUT_UNNECESSARY_CLARIFICATION: "模型追加了不会改变任务的澄清问题：原文未改动。",
  MODEL_OUTPUT_TASK_INTENT_DRIFT: "模型改变或遗漏了原文的核心任务动作：原文未改动。",
  MODEL_OUTPUT_OBJECT_DRIFT: "模型改变或遗漏了原文指定的交付物类型：原文未改动。",
  MODEL_OUTPUT_UNSUPPORTED_FACT: "模型新增了原文没有的量化阈值或验收数字：原文未改动。",
});

export function inferPromptErrorCode(error) {
  const directCode = typeof error?.code === "string" ? error.code : "";
  if (directCode && directCode !== "PROMPT_LIFT_ERROR") {
    return directCode;
  }
  const detail = [
    error?.message,
    error?.details?.message,
    error?.cause?.message,
  ].filter((value) => typeof value === "string").join(" ");
  const serializedCode = detail.match(/\b[A-Z][A-Z0-9_]{2,63}\b/u)?.[0] ?? "";
  if (KNOWN_ERROR_CODES.has(serializedCode)) {
    return serializedCode;
  }
  for (const [code, pattern] of ERROR_CODE_PATTERNS) {
    if (pattern.test(detail)) {
      return code;
    }
  }
  return directCode;
}

export function promptErrorMessage(error, fallback = "操作失败：原文未改动，请重试。") {
  const code = inferPromptErrorCode(error);
  if (Object.hasOwn(ERROR_MESSAGES, code)) {
    return ERROR_MESSAGES[code];
  }
  return fallback;
}

export function isKnownPromptErrorCode(code) {
  return typeof code === "string" && KNOWN_ERROR_CODES.has(code);
}
