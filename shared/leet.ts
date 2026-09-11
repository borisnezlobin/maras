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
  return spellingsOf(pattern, loose).map((spelling) => `0x${spelling}` as Hex);
}

/**
 * Combinations are decoded from an index rather than built up character by character, so
 * capping the count never truncates the word itself. Index 0 is always the exact spelling.
 */
export function spellingsOf(pattern: string, loose: boolean): string[] {
  const body = pattern.replace(/^0x/, "").toLowerCase();
  if (body === "") return [];
  if (!loose) return [body];

  const choices = body.split("").map((character) => [character, ...(LOOKALIKES[character] ?? [])]);
  const total = choices.reduce((count, options) => count * options.length, 1);
  const wanted = Math.min(total, MAX_PATTERNS);

  return Array.from({ length: wanted }, (_, index) => {
    let remaining = index;
    let spelling = "";
    for (let position = choices.length - 1; position >= 0; position--) {
      const options = choices[position];
      spelling = options[remaining % options.length] + spelling;
      remaining = Math.floor(remaining / options.length);
    }
    return spelling;
  });
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

export const GPU_HASHES_PER_SECOND = 600_000_000;

/** Roughly what an hour on a rented consumer GPU costs on the spot markets. */
export const GPU_USD_PER_HOUR = 0.4;

/** What the grind would cost someone who rents the compute rather than waits for it. */
export function describeCost(attempts: number): string {
  const usd = (attempts / GPU_HASHES_PER_SECOND / 3_600) * GPU_USD_PER_HOUR;
  if (usd < 0.01) return "under a cent";
  if (usd < 1) return `about ${Math.max(1, Math.round(usd * 100))} cents`;
  if (usd < 10) return `about $${usd.toFixed(2)}`;
  return `about $${Math.round(usd).toLocaleString()}`;
}

/**
 * Kept in step with web/lib/leet.ts. The rate is a parameter because the shipped miner runs a
 * few orders of magnitude slower than a dedicated GPU one, and quoting the wrong machine's
 * speed makes the estimate worse than none.
 */
export function describeEffort(attempts: number, hashesPerSecond = GPU_HASHES_PER_SECOND): string {
  const seconds = attempts / hashesPerSecond;
  if (seconds < 1) return "under a second";
  if (seconds < 90) return `${trim(seconds)} seconds`;
  if (seconds < 5_400) return `${trim(seconds / 60)} minutes`;
  if (seconds < 172_800) return `${trim(seconds / 3_600)} hours`;
  if (seconds < 31_536_000) return `${trim(seconds / 86_400)} days`;
  return "longer than a year";
}

function trim(value: number): string {
  return value < 10 ? value.toFixed(1) : String(Math.round(value));
}
