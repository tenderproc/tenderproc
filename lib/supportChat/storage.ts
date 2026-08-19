export interface StoredChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "tenderproc:supportChat:v1";

/** Guarded by callers running this only from useEffect (never during
 * render), so SSR/hydration never sees `window`. */
export function loadConversation(): StoredChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is StoredChatMessage =>
        (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string"
    );
  } catch {
    return [];
  }
}

export function saveConversation(messages: StoredChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Storage full or unavailable (private browsing) — conversation just
    // won't survive a refresh; not worth surfacing to the user.
  }
}

export function clearConversation(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
