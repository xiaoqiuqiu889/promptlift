export const IPC_RESPONSE_TAG = "__promptLiftIpc";

export function serializeIpcResult(value) {
  return {
    [IPC_RESPONSE_TAG]: "ok",
    value,
  };
}

export function serializeIpcError(error) {
  return {
    [IPC_RESPONSE_TAG]: "error",
    error: {
      name: error?.name ?? "Error",
      code: typeof error?.code === "string" ? error.code : "PROMPT_LIFT_ERROR",
      message: error instanceof Error ? error.message : String(error),
      ...(error?.details && typeof error.details === "object"
        ? { details: error.details }
        : {}),
    },
  };
}

export function reviveIpcResponse(response) {
  if (!response || response[IPC_RESPONSE_TAG] !== "error") {
    return { handled: false, value: response };
  }

  const payload = response.error ?? {};
  const error = new Error(
    typeof payload.message === "string" ? payload.message : "Prompt Lift 操作失败",
  );
  error.name = typeof payload.name === "string" ? payload.name : "Error";
  error.code = typeof payload.code === "string" ? payload.code : "PROMPT_LIFT_ERROR";
  if (payload.details && typeof payload.details === "object") {
    error.details = payload.details;
  }
  return { handled: true, error };
}
