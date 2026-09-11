import type { Hex } from "viem";

/**
 * Hex only has 0-9 and a-f, so these are the only lookalike swaps available. Asking for "cafe"
 * loosely also accepts "caf3", "c4fe" and "c4f3", which makes the grind that many times shorter.
 */
const LOOKALIKES: Record<string, string[]> = {
  a: ["4"],
  "4": ["a"],
  b: ["6", "8"],
  "6": ["b"],
  "8": ["b"],
  e: ["3"],
  "3": ["e"],
};

export const MAX_PATTERNS = 16;
export const MAX_PATTERN_NIBBLES = 8;

export function isPatternShape(pattern: string): boolean {
  return /^[0-9a-fA-F]{1,8}$/.test(pattern);
}

/**
 * Every lookalike spelling of `pattern`, the exact one first. Capped because the contract
 * stores a fixed number of alternatives.
 */
export function expandLoose(pattern: string, loose: boolean): Hex[] {
  const body = pattern.replace(/^0x/, "").toLowerCase();
  if (body === "") return [];
  if (!loose) return [`0x${body}` as Hex];

  let spellings = [""];
  for (const character of body) {
    const options = [character, ...(LOOKALIKES[character] ?? [])];
    spellings = spellings.flatMap((prefix) => options.map((option) => prefix + option));
    if (spellings.length > MAX_PATTERNS) break;
  }

  return spellings.slice(0, MAX_PATTERNS).map((spelling) => `0x${spelling}` as Hex);
}

/**
 * Expected attempts for a spec. A pattern can land at any of `41 - nibbles` nibble positions,
 * and any one of the variants counts, so both make the search easier.
 */
export function expectedAttempts(input: {
  minZeroBytes: number;
  hookMask?: number;
  patternNibbles?: number;
  variantCount?: number;
}): number {
  let probability = Math.pow(256, -input.minZeroBytes);
  if (input.hookMask !== undefined) probability *= Math.pow(2, -14);

  const nibbles = input.patternNibbles ?? 0;
  if (nibbles > 0) {
    const positions = 41 - nibbles;
    const variants = Math.max(1, input.variantCount ?? 1);
    probability *= Math.min(1, variants * positions * Math.pow(16, -nibbles));
  }

  return probability === 0 ? Infinity : 1 / probability;
}

const GPU_HASHES_PER_SECOND = 600_000_000;

export function describeEffort(attempts: number): string {
  const seconds = attempts / GPU_HASHES_PER_SECOND;
  if (seconds < 1) return "under a second";
  if (seconds < 90) return `about ${Math.round(seconds)} seconds`;
  if (seconds < 5_400) return `about ${Math.round(seconds / 60)} minutes`;
  if (seconds < 172_800) return `about ${Math.round(seconds / 3_600)} hours`;
  if (seconds < 31_536_000) return `about ${Math.round(seconds / 86_400)} days`;
  return "longer than a year";
}
