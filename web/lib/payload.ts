import { encodeDeployData, keccak256, type Address, type Hex } from "viem";

import { ownedVaultAbi, ownedVaultBytecode } from "@/lib/maras.generated";

/**
 * The owner arrives as a constructor argument because during construction `msg.sender` is the
 * throwaway CREATE3 proxy, not the buyer. It costs nothing: a CREATE3 address ignores the
 * creation code, so binding your address here does not change which address you get.
 */
export function vaultInitCode(owner: Address): Hex {
  return encodeDeployData({
    abi: ownedVaultAbi,
    bytecode: ownedVaultBytecode,
    args: [owner],
  });
}

export function vaultInitCodeHash(owner: Address): Hex {
  return keccak256(vaultInitCode(owner));
}
