import assert from 'node:assert/strict';
import test from 'node:test';

import { writeTextArtifactWithRetry } from '../scripts/artifactWriter.mjs';

test('artifact writer retries transient Windows file locks before succeeding', async () => {
  const attempts = [];
  const delays = [];

  await writeTextArtifactWithRetry('summary.json', '{"passed":true}\n', {
    writeFile: async (_target, _contents, _encoding) => {
      attempts.push('write');
      if (attempts.length < 3) {
        const error = new Error('temporarily locked');
        error.code = attempts.length === 1 ? 'UNKNOWN' : 'EPERM';
        throw error;
      }
    },
    wait: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  assert.equal(attempts.length, 3);
  assert.deepEqual(delays, [40, 120]);
});

test('artifact writer does not retry permanent write failures', async () => {
  let attempts = 0;

  await assert.rejects(
    writeTextArtifactWithRetry('summary.json', '{}', {
      writeFile: async () => {
        attempts += 1;
        const error = new Error('missing directory');
        error.code = 'ENOENT';
        throw error;
      },
      wait: async () => {
        throw new Error('wait should not be called');
      },
    }),
    /missing directory/,
  );

  assert.equal(attempts, 1);
});
