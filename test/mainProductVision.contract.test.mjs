import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("main process preserves the requested fast or review replacement policy", () => {
  const main = read("src/main.mjs");
  const preload = read("src/preload.mjs");

  assert.match(preload, /replace:\s*source\.replace !== false/);
  assert.match(main, /const shouldReplace = input\?\.replace !== false/);
  assert.match(main, /replaced:\s*shouldReplace/);
});

test("edited review results still use the original compare-and-swap transaction", () => {
  const main = read("src/main.mjs");
  const preload = read("src/preload.mjs");

  assert.match(main, /replacementTransactions\.begin\(requestId,/);
  assert.match(main, /replacementTransactions\.clear\(\)/);
  assert.match(main, /expectedText:\s*transaction\.expectedText/);
  assert.match(main, /cancelledRequestIds\.has\(operationId\)/);
  const applyHandler = main.slice(
    main.indexOf("handleIpc('prompt:apply'"),
    main.indexOf("handleIpc('prompt:restore'"),
  );
  assert.doesNotMatch(
    applyHandler,
    /finally\s*\{\s*replacementTransactions\.finish\(operationId\)/,
  );
  assert.match(
    applyHandler,
    /catch \(error\)\s*\{\s*replacementTransactions\.finish\(operationId\)/,
  );
  assert.match(applyHandler, /replacementTransactions\.confirmApplied\(operationId, text\)/);
  assert.match(preload, /operationId:\s*normalizeRequestId\(options\.operationId\)/);
});
