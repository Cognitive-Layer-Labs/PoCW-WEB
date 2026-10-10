/** Bloom's taxonomy levels, lowest to highest cognitive demand. */
export const BLOOM_LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

export const BLOOM_COLORS: Record<BloomLevel, string> = {
  Remember: "#6FD6C4",
  Understand: "#7FB4F5",
  Apply: "#A99CF7",
  Analyze: "#D58AF0",
  Evaluate: "#F35FB6",
  Create: "#FF6B6B",
};

export const OUTCOME_COLORS = {
  mastered: "#5EE3A1",
  attempted: "#F5B94C",
  untested: "#5C4E68",
} as const;

export type Outcome = keyof typeof OUTCOME_COLORS;

export const OUTCOME_LABELS: Record<Outcome, string> = {
  mastered: "Mastered",
  attempted: "Asked, not mastered",
  untested: "Not tested",
};

/** Normalise whatever casing the engine returns ("analyze", "ANALYSE"...). */
export function toBloom(value: string | undefined | null): BloomLevel | null {
  if (!value) return null;
  const v = value.trim().toLowerCase().replace("analyse", "analyze");
  return BLOOM_LEVELS.find((level) => level.toLowerCase() === v) ?? null;
}

export function bloomColor(value: string | undefined | null): string {
  const level = toBloom(value);
  return level ? BLOOM_COLORS[level] : "#AE9FBB";
}
