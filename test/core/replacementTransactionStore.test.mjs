import assert from 'node:assert/strict';
import test from 'node:test';

import { createReplacementTransactionStore } from '../../src/core/replacementTransactionStore.mjs';

const target = { handle: '123', processId: 456 };

test('replacement transactions bind target, original, and rolling CAS baseline', () => {
  let now = 1_000;
  const store = createReplacementTransactionStore({ now: () => now });

  store.begin('operation-1', {
    target,
    original: '原文',
  });

  assert.deepEqual(store.require('operation-1'), {
    target,
    original: '原文',
    expectedText: '原文',
  });
  store.confirmApplied('operation-1', '第一次结果');
  assert.equal(store.require('operation-1').expectedText, '第一次结果');
  now += 1_000;
  store.confirmApplied('operation-1', '第二次结果');
  assert.equal(store.require('operation-1').expectedText, '第二次结果');

  store.finish('operation-1');
  assert.throws(
    () => store.require('operation-1'),
    (error) => error.code === 'REPLACEMENT_CANCELLED',
  );
});

test('replacement transactions expire by idle and absolute deadlines', () => {
  let now = 10_000;
  const store = createReplacementTransactionStore({
    now: () => now,
    idleTtlMs: 1_000,
    absoluteTtlMs: 2_500,
  });

  store.begin('idle', { target, original: '原文' });
  now += 1_001;
  assert.throws(
    () => store.require('idle'),
    (error) => error.code === 'REPLACEMENT_EXPIRED',
  );

  now = 20_000;
  store.begin('absolute', { target, original: '原文' });
  now += 900;
  store.confirmApplied('absolute', '结果一');
  now += 900;
  store.confirmApplied('absolute', '结果二');
  now += 701;
  assert.throws(
    () => store.require('absolute'),
    (error) => error.code === 'REPLACEMENT_EXPIRED',
  );
});

test('replacement transactions copy target identity and clear previous operations', () => {
  const store = createReplacementTransactionStore();
  const mutableTarget = { handle: '123', processId: 456 };
  store.begin('first', { target: mutableTarget, original: 'A' });
  mutableTarget.handle = '999';
  assert.equal(store.require('first').target.handle, '123');

  store.begin('second', { target, original: 'B' });
  assert.throws(
    () => store.require('first'),
    (error) => error.code === 'REPLACEMENT_CANCELLED',
  );
  assert.equal(store.require('second').original, 'B');
});
