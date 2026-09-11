/**
 * Mirrors shared/leet.ts. The web app is a separate package, and this drives a displayed
 * estimate rather than anything the contract verifies, so a copy is acceptable here.
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
export const GPU_HASHES_PER_SECOND = 600_000_000;

const NO_PATTERN = "0x00000000" as const;

/**
 * The contract declares `bytes4[16]`, which viem types as a fixed tuple rather than an array.
 * Building it as a literal lets TypeScript infer the length instead of being told to assume it.
 */
export type PatternTuple = readonly [
  `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
  `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
  `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
  `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`,
];

export function padPatterns(spellings: readonly string[]): PatternTuple {
  const at = (index: number): `0x${string}` =>
    spellings[index] === undefined ? NO_PATTERN : (`0x${spellings[index]}` as `0x${string}`);

  return [
    at(0), at(1), at(2), at(3), at(4), at(5), at(6), at(7),
    at(8), at(9), at(10), at(11), at(12), at(13), at(14), at(15),
  ];
}

export function isPatternShape(pattern: string): boolean {
  return /^[0-9a-fA-F]{1,8}$/.test(pattern);
}

export function hasLookalikes(pattern: string): boolean {
  return pattern.toLowerCase().split("").some((character) => character in LOOKALIKES);
}

/** Every lookalike spelling of `pattern`, the exact one first. */
export function expandLoose(pattern: string, loose: boolean): string[] {
  const body = pattern.replace(/^0x/, "").toLowerCase();
  if (body === "") return [];
  if (!loose) return [body];

  let spellings = [""];
  for (const character of body) {
    const options = [character, ...(LOOKALIKES[character] ?? [])];
    spellings = spellings.flatMap((prefix) => options.map((option) => prefix + option));
    if (spellings.length > MAX_PATTERNS) break;
  }

  return spellings.slice(0, MAX_PATTERNS);
}

export interface EffortInput {
  minZeroBytes: number;
  hookMask?: number;
  patternNibbles?: number;
  variantCount?: number;
}

/**
 * A pattern can land at any of `41 - nibbles` nibble positions and any variant counts, so both
 * make the search easier.
 */
export function expectedAttempts(input: EffortInput): number {
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

export function describeEffort(attempts: number): string {
  const seconds = attempts / GPU_HASHES_PER_SECOND;
  if (seconds < 1) return "under a second";
  if (seconds < 90) return `about ${Math.round(seconds)} seconds`;
  if (seconds < 5_400) return `about ${Math.round(seconds / 60)} minutes`;
  if (seconds < 172_800) return `about ${Math.round(seconds / 3_600)} hours`;
  if (seconds < 31_536_000) return `about ${Math.round(seconds / 86_400)} days`;
  return "longer than a year";
}
