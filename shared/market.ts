import { readFileSync } from "node:fs";

import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeDeployData,
  http,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import type { Spec } from "./create3.js";
import {
  marasAbi,
  ownedProxyAbi,
  ownedProxyBytecode,
  ownedVaultAbi,
  ownedVaultBytecode,
} from "./generated/abi.js";

export { marasAbi };

const NO_PATTERN: Hex = "0x00000000";

export const MAX_PATTERNS = 16;

/**
 * The contract declares `bytes4[16]`, which viem types as a fixed tuple rather than an array.
 * Building it as a literal lets TypeScript infer the length instead of being told to assume it.
 */
export type PatternTuple = readonly [
  Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex,
  Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex,
];

/**
 * Each slot is `bytes4`, so a shorter pattern is left-padded to four bytes. That also
 * right-aligns the value in the uint32 the contract masks against.
 */
export function padPatterns(patterns: readonly Hex[]): PatternTuple {
  const at = (index: number): Hex => {
    const pattern = patterns[index];
    if (pattern === undefined) return NO_PATTERN;
    return `0x${pattern.replace(/^0x/, "").padStart(8, "0")}` as Hex;
  };

  return [
    at(0), at(1), at(2), at(3), at(4), at(5), at(6), at(7),
    at(8), at(9), at(10), at(11), at(12), at(13), at(14), at(15),
  ];
}

export interface OnChainSpec {
  minZeroBytes: number;
  hookMask: number;
  checkHookMask: boolean;
  patterns: PatternTuple;
  patternCount: number;
  patternNibbles: number;
}

function artifact(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * What a buyer gets at their address: a proxy they own and can point at any contract later. The
 * owner has to arrive as a constructor argument, because during construction `msg.sender` is the
 * throwaway CREATE3 proxy. This is free because a CREATE3 address ignores the creation code.
 */
export function payloadInitCode(owner: Address): Hex {
  return encodeDeployData({ abi: ownedProxyAbi, bytecode: ownedProxyBytecode, args: [owner] });
}

/** What every purchase deployed before the proxy, kept so older bindings still rebuild. */
function vaultInitCode(owner: Address): Hex {
  return encodeDeployData({ abi: ownedVaultAbi, bytecode: ownedVaultBytecode, args: [owner] });
}

/**
 * A seller has to reproduce the exact code a buyer bound by hash. Trying each payload this
 * package has ever deployed means a request posted before the default changed still fills.
 */
export function rebuildPayload(owner: Address, boundHash: Hex): Hex | undefined {
  const wanted = boundHash.toLowerCase();
  return [payloadInitCode(owner), vaultInitCode(owner)].find((code) => keccak256(code) === wanted);
}

/** Binds a salt to its seller, so a copied salt cannot be registered by someone else. */
export function commitHashFor(salt: Hex, seller: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }], [salt, seller]));
}

/** The contract takes a fixed-length pattern array, so the tail is padded and ignored. */
export function onChainSpec(spec: Spec): OnChainSpec {
  const patterns = (spec.patterns ?? []).slice(0, MAX_PATTERNS);
  const nibbles = patterns.length === 0 ? 0 : patterns[0].replace(/^0x/, "").length;

  return {
    minZeroBytes: spec.minZeroBytes,
    hookMask: spec.hookMask ?? 0,
    checkHookMask: spec.hookMask !== undefined,
    patterns: padPatterns(patterns),
    patternCount: patterns.length,
    patternNibbles: nibbles,
  };
}

export function specFromChain(onChain: OnChainSpec): Spec {
  return {
    minZeroBytes: onChain.minZeroBytes,
    hookMask: onChain.checkHookMask ? onChain.hookMask : undefined,
    patterns: onChain.patterns.slice(0, onChain.patternCount),
  };
}

export function marketAddress(): Address {
  const deployment = artifact("deployments/baseSepolia.json");
  return deployment.address as Address;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`missing env var ${name}`);
  return value;
}

export function chainClients() {
  const account = privateKeyToAccount(requireEnv("BASE_SEPOLIA_PRIVATE_KEY") as Hex);
  // The RPC endpoint is public, so only the key has to be supplied.
  const transport = http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org");
  return {
    account,
    publicClient: createPublicClient({ chain: baseSepolia, transport }),
    walletClient: createWalletClient({ account, chain: baseSepolia, transport }),
  };
}

export function explorerUrl(address: Address): string {
  return `https://sepolia.basescan.org/address/${address}`;
}
