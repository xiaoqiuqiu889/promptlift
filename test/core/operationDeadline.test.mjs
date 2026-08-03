import assert from "node:assert/strict";
import test from "node:test";

import {
  OPERATION_TIMEOUT_CODE,
  withOperationDeadline,
} from "../../src/core/operationDeadline.mjs";

test("withOperationDeadline returns a completed stage result", async () => {
  const result = await withOperationDeadline(
    Promise.resolve("done"),
    { stage: "model", timeoutMs: 50 },
  );

  assert.equal(result, "done");
});

test("withOperationDeadline rejects a stalled stage with a stable timeout code", async () => {
  await assert.rejects(
    withOperationDeadline(
      new Promise(() => {}),
      { stage: "model", timeoutMs: 15 },
    ),
    (error) => {
      assert.equal(error.code, OPERATION_TIMEOUT_CODE);
      assert.equal(error.stage, "model");
      assert.match(error.message, /model/i);
      return true;
    },
  );
});

test("withOperationDeadline clears its timer after an ordinary rejection", async () => {
  const expected = new Error("network failed");

  await assert.rejects(
    withOperationDeadline(
      Promise.reject(expected),
      { stage: "model", timeoutMs: 50 },
    ),
    (error) => error === expected,
  );
});
