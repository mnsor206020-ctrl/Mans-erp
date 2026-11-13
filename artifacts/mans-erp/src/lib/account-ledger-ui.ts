// Keep this policy local to the ledger; other reports retain their retry behavior.
export function retryLedgerRequest(failureCount: number, error: unknown): boolean {
  if (typeof error === "object" && error !== null && "status" in error && error.status === 400) {
    return false;
  }
  return failureCount < 3;
}

export function ledgerErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const { data, message } = error as { data?: unknown; message?: unknown };
  let text: unknown = message;
  if (typeof data === "string") text = data;
  else if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    text = body.error ?? body.message ?? body.detail ?? message;
  }
  if (typeof text !== "string") return fallback;
  // Strip only a leading transport prefix, never the useful server message.
  const clean = text.trim().replace(/^HTTP\s+\d{3}(?:[^:\r\n]*)(?::\s*|$)/i, "").trim();
  return clean || fallback;
}
