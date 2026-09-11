import { encodeDeployData, keccak256, type Address, type Hex } from "viem";

import { ownedProxyAbi, ownedProxyBytecode } from "@/lib/maras.generated";

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

/**
 * A seller has to reproduce the exact code a buyer bound by hash. Anything other than the default
 * payload, such as a vault bound before the proxy existed, has to be delivered with the buyer's
 * exact code supplied by hand: its bytecode carries a compiler metadata hash that a later compile
 * does not reproduce.
 */
export function rebuildPayload(owner: Address, boundHash: Hex): Hex | undefined {
  const code = payloadInitCode(owner);
  return keccak256(code) === boundHash.toLowerCase() ? code : undefined;
}
