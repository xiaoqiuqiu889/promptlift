import assert from "node:assert/strict";
import test from "node:test";

import {
  inferPromptErrorCode,
  isKnownPromptErrorCode,
  promptErrorMessage,
} from "../../src/core/errorCatalog.mjs";

test("error catalog preserves a stable model validation code through a generic wrapper", () => {
  const error = new Error("模型改写结果异常膨胀，已阻止覆盖原文。");
  error.code = "PROMPT_LIFT_ERROR";

  assert.equal(inferPromptErrorCode(error), "MODEL_OUTPUT_TOO_LONG");
  assert.match(promptErrorMessage(error), /模型结果过长/);
  assert.doesNotMatch(promptErrorMessage(error), /操作失败：原文未改动，请重试/);
});

test("the combined legacy apply message is reduced to the underlying model cause", () => {
  const error = new Error("操作失败，原始输入框未被覆盖，请检查设置后重试。（模型改写结果异常膨胀，已阻止覆盖原文。）");
  error.code = "PROMPT_LIFT_ERROR";

  assert.equal(inferPromptErrorCode(error), "MODEL_OUTPUT_TOO_LONG");
  assert.match(promptErrorMessage(error), /模型结果过长/);
  assert.doesNotMatch(promptErrorMessage(error), /原始输入框未被覆盖/);
});

test("a known code serialized across the Electron boundary is recovered", () => {
  const error = new Error("MODEL_NEEDS_INPUT: QA clarification required");
  error.code = "PROMPT_LIFT_ERROR";

  assert.equal(inferPromptErrorCode(error), "MODEL_NEEDS_INPUT");
});

test("each model validation failure explains one cause without collapsing into a generic message", () => {
  const cases = [
    ["MODEL_OUTPUT_FACT_LOSS", /事实锚点/],
    ["MODEL_OUTPUT_SCOPE_INVENTION", /产品、平台或应用场景/],
    ["MODEL_OUTPUT_SEMANTIC_ESCALATION", /建议、可能性、否定或承诺强度/],
    ["MODEL_OUTPUT_PERMISSION_SEEKING", /确认或继续询问/],
    ["MODEL_OUTPUT_FALSE_EXECUTION_CLAIM", /待执行任务/],
  ];

  for (const [code, expected] of cases) {
    assert.equal(isKnownPromptErrorCode(code), true);
    const message = promptErrorMessage({ code });
    assert.match(message, expected);
    assert.doesNotMatch(message, /模型结果未通过安全校验/);
  }
});

test("unknown errors stay generic instead of leaking mixed technical details into the UI", () => {
  const message = promptErrorMessage({
    code: "PROMPT_LIFT_ERROR",
    message: "internal detail from a lower layer",
  }, "操作失败：原文未改动，请重试。");

  assert.equal(message, "操作失败：原文未改动，请重试。");
  assert.doesNotMatch(message, /internal detail/);
});
