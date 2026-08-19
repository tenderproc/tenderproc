/** Appended by the model, per SYSTEM_PROMPT, when it decides the user needs
 * a human — stripped server-side before the reply ever reaches the client,
 * so the client only ever sees the boolean `needsHuman` flag. */
export const ESCALATE_MARKER = "[[ESCALATE_TO_HUMAN]]";

export function stripEscalationMarker(raw: string): { text: string; needsHuman: boolean } {
  const needsHuman = raw.includes(ESCALATE_MARKER);
  const text = raw.split(ESCALATE_MARKER).join("").trim();
  return { text, needsHuman };
}
