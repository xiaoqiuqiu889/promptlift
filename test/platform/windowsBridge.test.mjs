import test from 'node:test';
import assert from 'node:assert/strict';

import { createWindowsBridge, WindowsBridgeError } from '../../src/platform/windowsBridge.mjs';

function createClipboard(initial = 'previous clipboard') {
  let value = initial;
  return {
    readText: async () => value,
    writeText: async (next) => {
      value = next;
    },
    get value() {
      return value;
    },
  };
}

test('capturePrompt reads the target text and restores the previous clipboard', async () => {
  const clipboard = createClipboard();
  const calls = [];
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async (script, options) => {
      calls.push({ script, options });
      await clipboard.writeText('current prompt from Codex');
      return JSON.stringify({ handle: 42, title: 'Codex' });
    },
  });

  const captured = await bridge.capturePrompt('Codex');

  assert.deepEqual(captured, {
    text: 'current prompt from Codex',
    target: { handle: 42, title: 'Codex' },
  });
  assert.equal(clipboard.value, 'previous clipboard');
  assert.equal(calls[0].options.input.targetWindowTitlePattern, 'Codex');
  assert.doesNotMatch(calls[0].script, /current prompt from Codex/);
});

test('capturePrompt preserves a user clipboard update made while capture is finishing', async () => {
  let value = 'previous clipboard';
  let readCount = 0;
  const clipboard = {
    readText: async () => {
      readCount += 1;
      if (readCount === 2) {
        const captured = value;
        value = 'user copied this while capture was finishing';
        return captured;
      }
      return value;
    },
    writeText: async (next) => {
      value = next;
    },
  };
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async () => {
      value = 'target input';
      return JSON.stringify({ handle: 42, title: 'Codex' });
    },
  });

  const captured = await bridge.capturePrompt('Codex');

  assert.equal(captured.text, 'target input');
  assert.equal(value, 'user copied this while capture was finishing');
});

test('capturePrompt keeps a user clipboard update when the primary capture fails', async () => {
  let value = 'previous clipboard';
  const clipboard = {
    readText: async () => value,
    writeText: async (next) => {
      value = next;
    },
  };
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async () => {
      value = 'user copied during failed capture';
      throw new Error('capture failed');
    },
  });

  await assert.rejects(
    bridge.capturePrompt(),
    (error) => error.code === 'POWERSHELL_FAILED',
  );
  assert.equal(value, 'user copied during failed capture');
});

test('replacePrompt passes target identity and compare-and-swap text without leaving clipboard changes', async () => {
  const clipboard = createClipboard();
  const calls = [];
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async (script, options) => {
      calls.push({ script, options });
      if (calls.length === 1) {
        await clipboard.writeText(options.input.replacementText);
      }
      if (calls.length === 2) {
        await clipboard.writeText('优化后的提示词; do not execute');
        return JSON.stringify({ handle: 99, title: 'Codex' });
      }
      return JSON.stringify({ replaced: true });
    },
  });

  const result = await bridge.replacePrompt(
    '优化后的提示词; do not execute',
    { handle: 99, processId: 7, focusHandle: 101 },
    { expectedText: '原始提示词' },
  );

  assert.equal(result.replaced, JSON.stringify({ replaced: true }));
  assert.equal(clipboard.value, 'previous clipboard');
  assert.deepEqual(calls[0].options.input, {
    handle: 99,
    processId: 7,
    focusHandle: 101,
    expectedText: '原始提示词',
    replacementText: '优化后的提示词; do not execute',
  });
  assert.doesNotMatch(calls[0].script, /优化后的提示词|do not execute/);
});

test('replacePrompt forwards the captured original for atomic stale-input rejection', async () => {
  const clipboard = createClipboard();
  let input;
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async (_script, options) => {
      input = options.input;
      throw new Error('The target input changed after capture.');
    },
  });

  await assert.rejects(
    bridge.replacePrompt('增强结果', { handle: 99, processId: 7 }, {
      expectedText: '捕获原文',
    }),
    (error) => error.code === 'TARGET_CONTENT_CHANGED',
  );
  assert.equal(input.expectedText, '捕获原文');
  assert.equal(input.replacementText, '增强结果');
  assert.equal(clipboard.value, 'previous clipboard');
});

test('replacePrompt rejects a replacement that cannot be confirmed in the target input', async () => {
  const clipboard = createClipboard();
  let calls = 0;
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async () => {
      calls += 1;
      if (calls === 2) {
        await clipboard.writeText('AAAAAAA');
        return JSON.stringify({ handle: 99, title: 'Codex' });
      }
      return JSON.stringify({ replaced: true });
    },
  });

  await assert.rejects(
    bridge.replacePrompt('优化后的提示词', { handle: 99 }),
    (error) => error.code === 'REPLACE_NOT_CONFIRMED',
  );
});

test('replacePrompt accepts harmless contenteditable clipboard normalization', async () => {
  const clipboard = createClipboard();
  let calls = 0;
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async () => {
      calls += 1;
      if (calls === 2) {
        await clipboard.writeText('\uFEFFHeading\r\n- item\u00A0\n');
        return JSON.stringify({ handle: 99, title: 'Codex' });
      }
      return JSON.stringify({ replaced: true });
    },
  });

  const result = await bridge.replacePrompt(
    'Heading\n- item',
    { handle: 99, focusHandle: 101 },
    { expectedText: 'draft' },
  );

  assert.equal(result.handle, 99);
  assert.equal(calls, 2);
});

test('replacePrompt retries once when the target still contains the captured original', async () => {
  const clipboard = createClipboard();
  const calls = [];
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async (script, options) => {
      calls.push({ script, options });
      if (calls.length === 2) {
        await clipboard.writeText('draft');
        return JSON.stringify({ handle: 99, title: 'Codex', focusHandle: 101 });
      }
      if (calls.length === 4) {
        await clipboard.writeText('enhanced result');
        return JSON.stringify({ handle: 99, title: 'Codex', focusHandle: 101 });
      }
      return JSON.stringify({ replaced: true });
    },
  });

  const result = await bridge.replacePrompt(
    'enhanced result',
    { handle: 99, processId: 7, focusHandle: 101 },
    { expectedText: 'draft' },
  );

  assert.equal(result.handle, 99);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].options.input.focusHandle, 101);
  assert.equal(calls[2].options.input.focusHandle, 101);
});

test('Windows bridge uses atomic native Ctrl chords instead of text injection', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(
    new URL('../../src/platform/windowsBridge.mjs', import.meta.url),
    'utf8',
  ));
  assert.match(source, /SendInput/);
  assert.match(source, /sent != \(uint\)inputs\.Length/);
  assert.match(source, /ModifiersReleased/);
  assert.match(source, /IsWindow/);
  assert.match(source, /target window identity changed/i);
  assert.doesNotMatch(source, /keybd_event/);
  assert.match(source, /SendChord\(0x41\)/);
  assert.match(source, /SendChord\(0x43\)/);
  assert.match(source, /SendChord\(0x23\)/);
  assert.match(source, /SendChord\(0x56\)/);
  assert.match(source, /GetForegroundWindow\(\) -eq \$handle/);
  assert.match(source, /AttachThreadInput/);
  assert.match(source, /BringWindowToTop/);
  assert.match(source, /ShowWindow/);
  assert.match(source, /GetFocus/);
  assert.match(source, /SetFocus/);
  assert.match(source, /focusHandle/);
  assert.match(source, /\.Replace\(\[string\]\[char\]13, \[string\]::Empty\)/);
  assert.doesNotMatch(source, /\.Replace\(\[char\]13, ''\)/);
  assert.match(source, /for \(\$attempt = 0; \$attempt -lt 8/);
  assert.match(source, /InputEncoding/);
  assert.match(source, /OutputEncoding/);
  assert.doesNotMatch(source, /System\.Windows\.Forms\.SendKeys/);
});

test('capturePrompt accepts a saved target handle without interpolating it into the script', async () => {
  const clipboard = createClipboard();
  const calls = [];
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async (script, options) => {
      calls.push({ script, options });
      await clipboard.writeText('prompt from saved target');
      return JSON.stringify({ handle: 77, title: 'Claude' });
    },
  });

  const captured = await bridge.capturePrompt({ handle: 77, title: 'Claude' });

  assert.equal(captured.text, 'prompt from saved target');
  assert.equal(calls[0].options.input.handle, 77);
  assert.doesNotMatch(calls[0].script, /77/);
});

test('getForegroundTarget returns a reusable window target without touching the clipboard', async () => {
  const clipboard = createClipboard();
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async () => JSON.stringify({ handle: 123, title: 'Codex', processId: 456 }),
  });

  const target = await bridge.getForegroundTarget();

  assert.deepEqual(target, { handle: 123, title: 'Codex', processId: 456 });
  assert.equal(clipboard.value, 'previous clipboard');
});

test('capturePrompt rejects a stale clipboard instead of treating it as the prompt', async () => {
  const clipboard = createClipboard();
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async () => JSON.stringify({ handle: 42, title: 'Codex' }),
  });

  await assert.rejects(
    bridge.capturePrompt(),
    (error) => {
      assert.equal(error.code, 'PROMPT_NOT_CAPTURED');
      return true;
    },
  );
  assert.equal(clipboard.value, 'previous clipboard');
});

test('capturePrompt surfaces a bridge timeout and restores clipboard state', async () => {
  const clipboard = createClipboard();
  const bridge = createWindowsBridge({
    clipboard,
    timeoutMs: 10,
    runPowerShell: async () => new Promise(() => {}),
  });

  await assert.rejects(
    bridge.capturePrompt(),
    (error) => {
      assert.ok(error instanceof WindowsBridgeError);
      assert.equal(error.code, 'BRIDGE_TIMEOUT');
      return true;
    },
  );
  assert.equal(clipboard.value, 'previous clipboard');
});

test('windows bridge validates target and text inputs before crossing the process boundary', async () => {
  const bridge = createWindowsBridge({
    clipboard: createClipboard(),
    runPowerShell: async () => JSON.stringify({ handle: 1 }),
  });

  await assert.rejects(
    bridge.capturePrompt(0),
    (error) => error.code === 'TARGET_REQUIRED',
  );
  await assert.rejects(
    bridge.replacePrompt('text'),
    (error) => error.code === 'TARGET_REQUIRED',
  );
  await assert.rejects(
    bridge.copyText(123),
    (error) => error.code === 'INVALID_TEXT',
  );
});

test('windows bridge accepts compatible runner output shapes and target aliases', async () => {
  const clipboard = createClipboard();
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async (_script, options) => {
      if (options.input.targetWindowTitlePattern !== undefined) {
        await clipboard.writeText('captured through stdout');
        return { stdout: JSON.stringify({ target: { hwnd: 88, title: 'Claude' } }) };
      }
      return { output: JSON.stringify({ windowHandle: 88, title: 'Claude' }) };
    },
  });

  const captured = await bridge.capturePrompt('Claude');
  assert.deepEqual(captured.target, { handle: 88, title: 'Claude' });
  assert.deepEqual(await bridge.getForegroundTarget(), { handle: 88, title: 'Claude' });
  assert.deepEqual(bridge.getLastTarget(), { handle: 88, title: 'Claude' });
});

test('windows bridge classifies malformed targets and ordinary runner failures', async () => {
  const clipboard = createClipboard();
  const malformed = createWindowsBridge({
    clipboard,
    runPowerShell: async () => 'not json',
  });
  await assert.rejects(
    malformed.getForegroundTarget(),
    (error) => error.code === 'TARGET_INVALID',
  );

  const failed = createWindowsBridge({
    clipboard,
    runPowerShell: async () => {
      throw new Error('runner failed');
    },
  });
  await assert.rejects(
    failed.getForegroundTarget(),
    (error) => error.code === 'POWERSHELL_FAILED' && /getForegroundTarget failed/.test(error.message),
  );
});

test('windows bridge reports missing clipboard capabilities and restore failures', async () => {
  const missingRead = createWindowsBridge({
    clipboard: {},
    runPowerShell: async () => JSON.stringify({ handle: 1 }),
  });
  await assert.rejects(
    missingRead.capturePrompt(),
    (error) => error.code === 'CLIPBOARD_UNAVAILABLE',
  );

  let value = 'previous clipboard';
  const restoreFailureClipboard = {
    readText: async () => value,
    writeText: async (next) => {
      if (next === 'previous clipboard') {
        throw new Error('clipboard is temporarily locked');
      }
      value = next;
    },
  };
  const restoreFailure = createWindowsBridge({
    clipboard: restoreFailureClipboard,
    runPowerShell: async () => {
      value = 'captured prompt';
      return JSON.stringify({ handle: 42, title: 'Codex' });
    },
  });
  await assert.rejects(
    restoreFailure.capturePrompt(),
    (error) => error.code === 'CLIPBOARD_RESTORE_FAILED',
  );
});

test('windows bridge preserves the primary capture error when clipboard restore also fails', async () => {
  let value = 'previous clipboard';
  const clipboard = {
    readText: async () => value,
    writeText: async (next) => {
      if (next === 'previous clipboard') {
        throw new Error('clipboard restore failed');
      }
      value = next;
    },
  };
  const bridge = createWindowsBridge({
    clipboard,
    runPowerShell: async () => {
      throw new Error('capture failed');
    },
  });

  await assert.rejects(
    bridge.capturePrompt(),
    (error) => error.code === 'POWERSHELL_FAILED',
  );
});
