import { writeFile as nodeWriteFile } from 'node:fs/promises';

const TRANSIENT_WINDOWS_WRITE_CODES = new Set([
  'UNKNOWN',
  'EACCES',
  'EBUSY',
  'EPERM',
]);
const RETRY_DELAYS_MS = Object.freeze([40, 120, 300]);

function waitFor(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function writeTextArtifactWithRetry(
  targetPath,
  contents,
  {
    writeFile = nodeWriteFile,
    wait = waitFor,
  } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await writeFile(targetPath, contents, 'utf8');
      return;
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      const isTransient = TRANSIENT_WINDOWS_WRITE_CODES.has(error?.code);
      if (!isTransient || delay === undefined) {
        throw error;
      }
      await wait(delay);
    }
  }
}
