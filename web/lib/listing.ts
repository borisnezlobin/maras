import type { Address, Hex } from "viem";

import { HOOK_FLAGS } from "@/lib/address";
import { ENGLISH_FOR_HEX } from "@/lib/hex-words.generated";
import { expandLoose, isPatternShape } from "@/lib/leet";

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
/**
 * The word a spelling was mined for: `7ab1e7` reads as "tablet". A spelling that is in no
 * dictionary, such as a deliberate `129303`, was asked for exactly and is shown as it is.
 */
export function displayWord(spelling: string): string {
  return ENGLISH_FOR_HEX[spelling] ?? spelling;
}

const HEX_FOR_ENGLISH: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ENGLISH_FOR_HEX).map(([spelling, word]) => [word, spelling]),
);

/**
 * The spellings a search should match. The pill on a grinder find reads "tablet", so typing
 * "tablet" has to find `7ab1e7`; anything already in hex keeps its lookalike expansions.
 */
export function spellingsForSearch(query: string): string[] {
  const needle = query.toLowerCase();
  if (isPatternShape(needle)) return expandLoose(needle, true);
  const spelling = HEX_FOR_ENGLISH[needle];
  return spelling === undefined ? [] : [spelling];
}

/** The V4 permissions a spec pins, or none when it leaves the hook bits free. */
export function permissionNames(spec: OnChainSpec): string[] {
  if (!spec.checkHookMask) return [];
  return HOOK_FLAGS.filter(([bit]) => ((spec.hookMask >> bit) & 1) === 1).map(([, name]) => name);
}

export function declaredWords(spec: OnChainSpec | undefined): string[] {
  if (spec === undefined || spec.patternCount === 0) return [];

  return spec.patterns
    .slice(0, spec.patternCount)
    .map((pattern) => pattern.replace(/^0x/, "").slice(-spec.patternNibbles));
}
