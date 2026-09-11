import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/**
 * Binds a salt to the address that will reveal it. The contract recomputes this from
 * `msg.sender`, so a salt copied out of a pending transaction is useless to anyone else: their
 * commitment hashes to something different.
 *
 * Computing it here means handing this server the salt. An agent that would rather not can hash
 * it locally and pass the commitment instead — every tool that takes a salt for this purpose
 * accepts a `commitHash` in its place.
 */
export function commitHashFor(salt: Hex, seller: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }], [salt, seller]));
}
