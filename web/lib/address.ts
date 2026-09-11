const HOOK_PERMISSION_MASK = BigInt(0x3fff);
const WEI_PER_ETH = BigInt(10) ** BigInt(18);

export interface PatternMatch {
  start: number;
  length: number;
}

/** Counts whole zero bytes from the most significant end, matching the contract's check. */
export function leadingZeroBytes(address: string): number {
  const body = address.slice(2).toLowerCase();
  let count = 0;
  while (body.slice(count * 2, count * 2 + 2) === "00") count++;
  return count;
}

export function hookMask(address: string): number {
  return Number(BigInt(address) & HOOK_PERMISSION_MASK);
}

/** Byte-aligned search, so the highlight lines up with what the contract actually verifies. */
export function findPattern(address: string, pattern: string): PatternMatch | null {
  const body = address.slice(2).toLowerCase();
  const needle = pattern.replace(/^0x/, "").toLowerCase();
  if (needle.length === 0) return null;

  for (let byte = 0; byte <= body.length / 2 - needle.length / 2; byte++) {
    if (body.startsWith(needle, byte * 2)) {
      return { start: byte * 2, length: needle.length };
    }
  }
  return null;
}

export function formatEth(wei: bigint): string {
  if (wei === BigInt(0)) return "free";
  const whole = wei / WEI_PER_ETH;
  const fraction = (wei % WEI_PER_ETH).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction.length === 0 ? `${whole} ETH` : `${whole}.${fraction} ETH`;
}

/** Difficulty of a spec in expected attempts, used to explain what a listing cost to find. */
export function expectedAttempts(zeroBytes: number, hasHookMask: boolean, hasPattern: boolean): number {
  let bits = zeroBytes * 8;
  if (hasHookMask) bits += 14;
  if (hasPattern) bits += 32;
  return 2 ** bits;
}

const GPU_HASHES_PER_SECOND = 600_000_000;

/** Always a duration phrase, so it reads the same wherever it is dropped into a sentence. */
export function describeEffort(attempts: number): string {
  const seconds = attempts / GPU_HASHES_PER_SECOND;
  if (seconds < 1) return "under a second of GPU time";
  if (seconds < 90) return `about ${Math.round(seconds)} seconds of GPU time`;
  if (seconds < 5_400) return `about ${Math.round(seconds / 60)} minutes of GPU time`;
  if (seconds < 172_800) return `about ${Math.round(seconds / 3_600)} hours of GPU time`;
  return `about ${Math.round(seconds / 86_400)} days of GPU time`;
}
