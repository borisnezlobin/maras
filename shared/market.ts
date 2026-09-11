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
import { marasAbi, ownedVaultAbi, ownedVaultBytecode } from "./generated/abi.js";

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

export function padPatterns(patterns: readonly Hex[]): PatternTuple {
  const at = (index: number): Hex => patterns[index] ?? NO_PATTERN;
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
 * The owner has to arrive as a constructor argument: during construction `msg.sender` is the
 * throwaway CREATE3 proxy. This is free because a CREATE3 address ignores the creation code.
 */
export function vaultInitCode(owner: Address): Hex {
  return encodeDeployData({
    abi: ownedVaultAbi,
    bytecode: ownedVaultBytecode,
    args: [owner],
  });
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
