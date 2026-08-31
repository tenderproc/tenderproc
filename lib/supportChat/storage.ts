export interface StoredChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "tenderproc:supportChat:v1";

/** Guarded by callers running this only from useEffect (never during
 * render), so SSR/hydration never sees `window`. sessionStorage (not
 * localStorage) is intentional: the widget should reset to a fresh
 * greeting each time a new browser session starts, not persist forever. */
export function loadConversation(): StoredChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
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
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // Storage full or unavailable (private browsing) — conversation just
    // won't survive a refresh; not worth surfacing to the user.
  }
}

export function clearConversation(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
