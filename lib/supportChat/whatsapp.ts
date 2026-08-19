/** Builds a wa.me handoff link pre-filled with what the user was asking
 * about, so the operator has context without the visitor repeating
 * themselves. `lastUserMessage` may be empty (e.g. the widget errored
 * before the visitor sent anything) — the lead-in still makes sense alone. */
export function buildWhatsAppUrl(lastUserMessage: string, leadIn: string): string {
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const trimmed = lastUserMessage.trim();
  const text = trimmed ? `${leadIn}\n\n"${trimmed}"` : leadIn;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
