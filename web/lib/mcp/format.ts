import { formatEther, type Hex } from "viem";

import { hookPermissions, leadingZeroBytes } from "@/lib/address";
import { expandLoose, padPatterns } from "@/lib/leet";
import { market, type OnChainSpecRecord, type NamedListing, type RequestRecord, type SealedListing } from "@/lib/mcp/reads";

export function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

/**
 * Anything that costs money comes back as an unsigned transaction. This server holds no keys, so
 * the caller signs with a wallet it controls and nothing here can move its funds.
 */
export function unsignedTransaction(data: Hex, value: bigint, note: string) {
  return text(
    `${note}\n\nSend this transaction from your own wallet on Base Sepolia (chain 84532):\n\n` +
      `  to     ${market}\n  value  ${value} wei (${formatEther(value)} ETH)\n  data   ${data}`,
  );
}

/** The words the seller declared, which the contract verified before accepting the listing. */
export function declaredWords(spec: OnChainSpecRecord): string[] {
  return spec.patterns
    .slice(0, spec.patternCount)
    .map((pattern) => pattern.replace(/^0x/, "").slice(-spec.patternNibbles));
}

export interface SpecInput {
  minZeroBytes: number;
  pattern?: string;
  loose: boolean;
  hookMask?: number;
}

export interface BuiltSpec {
  minZeroBytes: number;
  hookMask: number;
  checkHookMask: boolean;
  patterns: ReturnType<typeof padPatterns>;
  patternCount: number;
  patternNibbles: number;
}

export function buildSpec(input: SpecInput): BuiltSpec {
  const spellings = expandLoose(input.pattern ?? "", input.loose);

  return {
    minZeroBytes: input.minZeroBytes,
    hookMask: input.hookMask ?? 0,
    checkHookMask: input.hookMask !== undefined,
    patterns: padPatterns(spellings),
    patternCount: spellings.length,
    patternNibbles: spellings[0]?.length ?? 0,
  };
}

export function describeSpec(spec: OnChainSpecRecord): string {
  const parts: string[] = [`${spec.minZeroBytes} zero bytes`];
  const words = declaredWords(spec);
  if (words.length > 0) parts.push(`contains ${words[0]}`);
  if (spec.checkHookMask) parts.push(`hook bits 0x${spec.hookMask.toString(16).padStart(4, "0")}`);
  return parts.join(", ");
}

export function describeNamed(id: bigint, listing: NamedListing): string {
  const zeros = leadingZeroBytes(listing.predicted);
  const permissions = hookPermissions(listing.predicted).length;
  const words = declaredWords(listing.spec);
  const minedFor = words.length === 0 ? "" : ` · contains ${words[0]}`;

  return `#${id} ${listing.predicted} · ${zeros} zero bytes${minedFor} · ${permissions} V4 permissions · ${formatEther(listing.price)} ETH`;
}

export function secondsLeft(deadline: bigint): number {
  return Number(deadline) - Math.floor(Date.now() / 1000);
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function sealedIsOpen(listing: SealedListing): boolean {
  return !listing.settled && listing.buyer === ZERO_ADDRESS;
}

export function describeSealed(id: bigint, listing: SealedListing): string {
  const promise = describeSpec(listing.spec);
  const money = `${formatEther(listing.price)} ETH, ${formatEther(listing.bond)} ETH bond`;
  if (sealedIsOpen(listing)) return `#${id} unsold · promises ${promise} · ${money}`;

  const left = secondsLeft(listing.deadline);
  const state = left > 0 ? `${left}s left to deliver` : "window closed, buyer may reclaim";
  return `#${id} bought by ${listing.buyer} · promises ${promise} · ${money} · ${state}`;
}

export function describeRequest(id: bigint, request: RequestRecord): string {
  const state = request.filled ? "filled" : "open";
  return `#${id} ${state} · wants ${describeSpec(request.spec)} · ${formatEther(request.bounty)} ETH bounty · posted by ${request.buyer}`;
}
