import assert from "node:assert/strict";
import test from "node:test";

import {
  reviveIpcResponse,
  serializeIpcError,
  serializeIpcResult,
} from "../../src/core/ipcProtocol.mjs";

test("ipc response envelopes preserve successful values", () => {
  const response = serializeIpcResult({ applied: true });
  assert.equal(response.__promptLiftIpc, "ok");
  assert.deepEqual(reviveIpcResponse(response), {
    handled: false,
    value: response,
  });
});
test("ipc response envelopes revive stable error codes", () => {
  const response = serializeIpcError(Object.assign(
    new Error("target input changed"),
    { code: "TARGET_CONTENT_CHANGED", details: { handle: 42 } },
  ));

  const revived = reviveIpcResponse(response);
  assert.equal(revived.handled, true);
  assert.equal(revived.error.code, "TARGET_CONTENT_CHANGED");
  assert.equal(revived.error.message, "target input changed");
  assert.deepEqual(revived.error.details, { handle: 42 });
});
