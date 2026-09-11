import {
  parseEventLogs,
  zeroAddress,
  type Address,
  type ContractFunctionParameters,
  type Hex,
  type PublicClient,
} from "viem";

import type { OnChainSpec } from "@/lib/listing";
import {
  MARAS_ADDRESS,
  MARAS_BLOCK,
  marasAbi,
  ownedProxyAbi,
  ownedVaultAbi,
} from "@/lib/maras.generated";

/** Query key for the connected wallet's addresses, refreshed after anything that changes them. */
export const OWNED_KEY = "owned-addresses";

export type AddressSource = "request" | "named" | "sealed";

/** A proxy can be pointed at any contract; a vault is what purchases deployed before that. */
export type PayloadKind = "proxy" | "vault";

export interface Delivery {
  address: Address;
  source: AddressSource;
  id: bigint;
  txHash: Hex;
}

interface Control {
  kind: PayloadKind;
  owner: Address;
  /** Where a proxy forwards its calls, or null before it has been pointed anywhere. */
  implementation: Address | null;
}

export interface OwnedAddress extends Delivery, Control {
  spec: OnChainSpec;
}

/**
 * The three reads this needs. Taking only these keeps any chain's client acceptable: a Base
 * client's blocks carry OP-stack deposit transactions, which the generic client type rejects.
 */
type Reader = Pick<PublicClient, "getBlockNumber" | "getLogs" | "multicall">;

type CallResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error: Error };

const DELIVERY_EVENTS = ["RequestFilled", "NamedSold", "SealedDelivered"] as const;
type DeliveryEvent = (typeof DELIVERY_EVENTS)[number];

const SOURCE_OF: Record<DeliveryEvent, AddressSource> = {
  RequestFilled: "request",
  NamedSold: "named",
  SealedDelivered: "sealed",
};

const RECORD_READER = {
  request: "getRequest",
  named: "getNamedListing",
  sealed: "getSealedListing",
} as const;

// Public endpoints refuse log queries much wider than this many blocks.
const BLOCK_SPAN = BigInt(9_999);
const ONE = BigInt(1);

/**
 * A delivered address is recorded only in the event that deployed it; the listing and request
 * records keep a sold or filled flag and nothing more. Reading every log from the contract and
 * decoding locally costs one request per span, rather than one per event type.
 */
export async function findDeliveries(client: Reader): Promise<Delivery[]> {
  const latest = await client.getBlockNumber();
  const deliveries: Delivery[] = [];

  for (let from = BigInt(MARAS_BLOCK ?? 0); from <= latest; from += BLOCK_SPAN + ONE) {
    const to = from + BLOCK_SPAN > latest ? latest : from + BLOCK_SPAN;
    const logs = await client.getLogs({ address: MARAS_ADDRESS as Address, fromBlock: from, toBlock: to });
    const events = parseEventLogs({ abi: marasAbi, logs, eventName: [...DELIVERY_EVENTS] });

    for (const event of events) {
      deliveries.push({
        address: event.args.deployed,
        source: SOURCE_OF[event.eventName],
        id: event.args.id,
        txHash: event.transactionHash,
      });
    }
  }

  return deliveries;
}

function controlFrom(
  proxyOwner: CallResult,
  implementation: CallResult,
  vaultOwner: CallResult,
): Control | null {
  if (proxyOwner.status === "success") {
    const pointed = implementation.status === "success" ? (implementation.result as Address) : zeroAddress;
    return {
      kind: "proxy",
      owner: proxyOwner.result as Address,
      implementation: pointed === zeroAddress ? null : pointed,
    };
  }
  if (vaultOwner.status === "success") {
    return { kind: "vault", owner: vaultOwner.result as Address, implementation: null };
  }
  return null;
}

/**
 * Asks each deployed contract who controls it. Ownership is whatever that contract says, since
 * it is what actually decides who can use the address. A vault's `owner()` is trusted only when
 * `proxyOwner()` fails: a proxy pointed at a contract with its own `owner()` forwards the call
 * and would report that contract's owner instead.
 */
async function readControl(client: Reader, deliveries: Delivery[]): Promise<(Control | null)[]> {
  const calls: ContractFunctionParameters[] = deliveries.flatMap((delivery) => [
    { address: delivery.address, abi: ownedProxyAbi, functionName: "proxyOwner" },
    { address: delivery.address, abi: ownedProxyAbi, functionName: "proxyImplementation" },
    { address: delivery.address, abi: ownedVaultAbi, functionName: "owner" },
  ]);
  const results = (await client.multicall({ contracts: calls })) as CallResult[];

  return deliveries.map((_, index) =>
    controlFrom(results[index * 3], results[index * 3 + 1], results[index * 3 + 2]),
  );
}

async function attachSpecs<T extends Delivery>(
  client: Reader,
  deliveries: T[],
): Promise<(T & { spec: OnChainSpec })[]> {
  if (deliveries.length === 0) return [];

  const calls: ContractFunctionParameters[] = deliveries.map((delivery) => ({
    address: MARAS_ADDRESS as Address,
    abi: marasAbi,
    functionName: RECORD_READER[delivery.source],
    args: [delivery.id],
  }));
  const records = (await client.multicall({ contracts: calls })) as CallResult[];

  const withSpecs: (T & { spec: OnChainSpec })[] = [];
  records.forEach((entry, index) => {
    if (entry.status !== "success") return;
    const record = entry.result as { spec: OnChainSpec };
    withSpecs.push({ ...deliveries[index], spec: record.spec });
  });

  return withSpecs;
}

export async function findOwnedAddresses(
  client: Reader,
  account: Address,
): Promise<OwnedAddress[]> {
  const deliveries = await findDeliveries(client);
  if (deliveries.length === 0) return [];

  const controls = await readControl(client, deliveries);
  const mine: (Delivery & Control)[] = [];
  deliveries.forEach((delivery, index) => {
    const control = controls[index];
    if (control === null || control.owner.toLowerCase() !== account.toLowerCase()) return;
    mine.push({ ...delivery, ...control });
  });

  return (await attachSpecs(client, mine)).reverse();
}
