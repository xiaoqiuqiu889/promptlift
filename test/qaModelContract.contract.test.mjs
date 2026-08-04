import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(
  new URL("../scripts/qa-model-contract.mjs", import.meta.url),
  "utf8",
);

test("real-model contract covers direct product feedback without invented Word context", () => {
  assert.match(script, /PRODUCT_FEEDBACK_SOURCE/);
  assert.match(script, /审阅后应用/);
  assert.match(script, /四种沟通模式/);
  assert.match(script, /FORBIDDEN_PRODUCT_CONTEXT/);
  assert.match(script, /Word/);
  assert.match(script, /第三方插件/);
  assert.match(script, /productScopePreserved/);
  assert.match(script, /inventedProductContext/);
});

test("real-model contract covers WorkBuddy downstream context references", () => {
  assert.match(script, /CONTEXT_REFERENCE_SOURCE/);
  assert.match(script, /其他agent给我提了这个建议/);
  assert.match(script, /style:\s*['"]workbuddy['"]/);
  assert.match(script, /contextReferencePreserved/);
  assert.match(script, /blockingClarification/);
  assert.match(script, /请.*提供|请.*补充/);
});

test("real-model QA reports bounded booleans instead of successful raw model text", () => {
  assert.match(script, /cases:\s*caseResults/);
  assert.doesNotMatch(script, /qaResult:\s*result/);
  assert.doesNotMatch(script, /result:\s*String\(error\?\.qaResult/);
});
