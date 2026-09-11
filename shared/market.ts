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

export interface OnChainSpec {
  minZeroBytes: number;
  hookMask: number;
  checkHookMask: boolean;
  pattern: Hex;
  checkPattern: boolean;
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

export function onChainSpec(spec: Spec): OnChainSpec {
  return {
    minZeroBytes: spec.minZeroBytes,
    hookMask: spec.hookMask ?? 0,
    checkHookMask: spec.hookMask !== undefined,
    pattern: spec.pattern ?? NO_PATTERN,
    checkPattern: spec.pattern !== undefined,
  };
}

export function specFromChain(onChain: OnChainSpec): Spec {
  return {
    minZeroBytes: onChain.minZeroBytes,
    hookMask: onChain.checkHookMask ? onChain.hookMask : undefined,
    pattern: onChain.checkPattern ? onChain.pattern : undefined,
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
  const transport = http(requireEnv("BASE_SEPOLIA_RPC_URL"));
  return {
    account,
    publicClient: createPublicClient({ chain: baseSepolia, transport }),
    walletClient: createWalletClient({ account, chain: baseSepolia, transport }),
  };
}

export function explorerUrl(address: Address): string {
  return `https://sepolia.basescan.org/address/${address}`;
}
