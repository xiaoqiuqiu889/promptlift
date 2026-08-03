export const OPERATION_TIMEOUT_CODE = "OPERATION_TIMEOUT";

export function withOperationDeadline(operation, {
  stage = "operation",
  timeoutMs,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.resolve(operation);
  }

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${stage} timed out`);
      error.code = OPERATION_TIMEOUT_CODE;
      error.stage = stage;
      error.timeoutMs = timeoutMs;
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(operation), timeout])
    .finally(() => clearTimeout(timer));
}
