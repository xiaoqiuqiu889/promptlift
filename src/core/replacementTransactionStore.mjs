const DEFAULT_IDLE_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_ABSOLUTE_TTL_MS = 2 * 60 * 60 * 1_000;

function transactionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function publicTransaction(transaction) {
  return {
    target: { ...transaction.target },
    original: transaction.original,
    expectedText: transaction.expectedText,
  };
}

export function createReplacementTransactionStore({
  now = Date.now,
  idleTtlMs = DEFAULT_IDLE_TTL_MS,
  absoluteTtlMs = DEFAULT_ABSOLUTE_TTL_MS,
} = {}) {
  const transactions = new Map();

  function requireTransaction(operationId) {
    const transaction = transactions.get(operationId);
    if (!transaction) {
      throw transactionError(
        'REPLACEMENT_CANCELLED',
        '本次处理已取消或失效，原始输入框未被覆盖。',
      );
    }
    const currentTime = now();
    if (currentTime - transaction.lastActiveAt > idleTtlMs
      || currentTime - transaction.createdAt > absoluteTtlMs) {
      transactions.delete(operationId);
      throw transactionError(
        'REPLACEMENT_EXPIRED',
        '本次处理已过期，请重新读取输入框后再试。',
      );
    }
    return transaction;
  }

  return {
    begin(operationId, { target, original }) {
      transactions.clear();
      const currentTime = now();
      transactions.set(operationId, {
        target: { ...target },
        original,
        expectedText: original,
        createdAt: currentTime,
        lastActiveAt: currentTime,
      });
    },

    require(operationId) {
      return publicTransaction(requireTransaction(operationId));
    },

    confirmApplied(operationId, appliedText) {
      const transaction = transactions.get(operationId);
      if (!transaction) {
        return false;
      }
      transaction.expectedText = appliedText;
      transaction.lastActiveAt = now();
      return true;
    },

    finish(operationId) {
      transactions.delete(operationId);
    },

    clear() {
      transactions.clear();
    },
  };
}
