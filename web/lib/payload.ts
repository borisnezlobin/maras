import { encodeDeployData, keccak256, type Address, type Hex } from "viem";

import {
  ownedProxyAbi,
  ownedProxyBytecode,
  ownedVaultAbi,
  ownedVaultBytecode,
} from "@/lib/maras.generated";

/**
 * What a buyer gets at their address: a proxy they own and can point at any contract later, the
 * way a domain is pointed at a server. The owner arrives as a constructor argument because during
 * construction `msg.sender` is the throwaway CREATE3 proxy. Binding it costs nothing, since a
 * CREATE3 address ignores the creation code.
 */
export function payloadInitCode(owner: Address): Hex {
  return encodeDeployData({ abi: ownedProxyAbi, bytecode: ownedProxyBytecode, args: [owner] });
}

export function payloadInitCodeHash(owner: Address): Hex {
  return keccak256(payloadInitCode(owner));
}

/** What every purchase deployed before the proxy, kept so older bindings still rebuild. */
function vaultInitCode(owner: Address): Hex {
  return encodeDeployData({ abi: ownedVaultAbi, bytecode: ownedVaultBytecode, args: [owner] });
}

/**
 * A seller has to reproduce the exact code a buyer bound by hash. Trying each payload this app
 * has ever deployed means a request posted before the default changed still fills.
 */
export function rebuildPayload(owner: Address, boundHash: Hex): Hex | undefined {
  const wanted = boundHash.toLowerCase();
  return [payloadInitCode(owner), vaultInitCode(owner)].find((code) => keccak256(code) === wanted);
}
