import type { Address, Hex } from "viem";

export interface OnChainSpec {
  minZeroBytes: number;
  hookMask: number;
  checkHookMask: boolean;
  patterns: readonly Hex[];
  patternCount: number;
  patternNibbles: number;
}

export interface NamedListingRecord {
  seller: Address;
  price: bigint;
  salt: Hex;
  predicted: Address;
  sold: boolean;
  spec: OnChainSpec;
}

/**
 * The words the seller declared when listing. The contract re-derived the address and checked
 * them before accepting, so these are verified rather than guessed from the address.
 */
export function declaredWords(spec: OnChainSpec | undefined): string[] {
  if (spec === undefined || spec.patternCount === 0) return [];

  return spec.patterns
    .slice(0, spec.patternCount)
    .map((pattern) => pattern.replace(/^0x/, "").slice(-spec.patternNibbles));
}
