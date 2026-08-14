export interface Stage {
  key: string;
  label: string;
}

// Terminal stages (won/lost) are kept separate from the active pipeline so
// the board can render them as a smaller "closed" group rather than full
// columns.
export const ACTIVE_STAGES: Stage[] = [
  { key: "screening", label: "Screening" },
  { key: "reviewing", label: "Reviewing" },
  { key: "applying", label: "Applying" },
  { key: "submitted", label: "Submitted" },
];

export const TERMINAL_STAGES: Stage[] = [
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

export const ALL_STAGES: Stage[] = [...ACTIVE_STAGES, ...TERMINAL_STAGES];

export function stageLabel(key: string): string {
  return ALL_STAGES.find((s) => s.key === key)?.label ?? key;
}
