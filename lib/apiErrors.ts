/** API routes return a stable `code` alongside their human `error` message
 * so the client can show it translated; falls back to the raw (English)
 * message for any code not yet mapped, or to the caller's own fallback. */
export function apiErrorMessage(
  data: { error?: string; code?: string } | null | undefined,
  t: (key: string) => string,
  fallback: string
): string {
  if (data?.code) {
    try {
      return t(data.code);
    } catch {
      // fall through
    }
  }
  return data?.error || fallback;
}
