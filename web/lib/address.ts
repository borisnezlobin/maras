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

/** Uniswap V4 reads a hook's permissions from these bits of its own address. */
export const HOOK_FLAGS: ReadonlyArray<readonly [number, string]> = [
  [13, "beforeInitialize"],
  [12, "afterInitialize"],
  [11, "beforeAddLiquidity"],
  [10, "afterAddLiquidity"],
  [9, "beforeRemoveLiquidity"],
  [8, "afterRemoveLiquidity"],
  [7, "beforeSwap"],
  [6, "afterSwap"],
  [5, "beforeDonate"],
  [4, "afterDonate"],
  [3, "beforeSwapReturnsDelta"],
  [2, "afterSwapReturnsDelta"],
  [1, "afterAddLiquidityReturnsDelta"],
  [0, "afterRemoveLiquidityReturnsDelta"],
];

export function hookPermissions(address: string): string[] {
  const mask = hookMask(address);
  return HOOK_FLAGS.filter(([bit]) => ((mask >> bit) & 1) === 1).map(([, name]) => name);
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
