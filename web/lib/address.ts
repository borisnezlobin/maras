const HOOK_PERMISSION_MASK = BigInt(0x3fff);
const WEI_PER_ETH = BigInt(10) ** BigInt(18);

export interface NibbleMatch {
  /** Index into the address body, counted in nibbles. */
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

/**
 * Nibble-aligned search, identical to the contract. Alignment by nibble is what lets a pattern
 * be an odd number of hex characters and start anywhere in the address.
 */
export function findNibbleRun(address: string, patterns: string[]): NibbleMatch | null {
  const body = address.slice(2).toLowerCase();

  for (const pattern of patterns) {
    const needle = pattern.replace(/^0x/, "").toLowerCase();
    if (needle === "") continue;
    const index = body.indexOf(needle);
    if (index !== -1) return { start: index, length: needle.length };
  }
  return null;
}

export function formatEth(wei: bigint): string {
  if (wei === BigInt(0)) return "free";
  const whole = wei / WEI_PER_ETH;
  const fraction = (wei % WEI_PER_ETH).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction.length === 0 ? `${whole} ETH` : `${whole}.${fraction} ETH`;
}

export function shortHex(address: string): string {
  return `${address.slice(0, 10)}…${address.slice(-6)}`;
}
