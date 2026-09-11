import { parseEventLogs, type Address, type Hex, type PublicClient } from "viem";

import type { OnChainSpec } from "@/lib/listing";
import { MARAS_ADDRESS, MARAS_BLOCK, marasAbi, ownedVaultAbi } from "@/lib/maras.generated";

export type AddressSource = "request" | "named" | "sealed";

export interface OwnedAddress {
  address: Address;
  source: AddressSource;
  id: bigint;
  spec: OnChainSpec;
  txHash: Hex;
}

interface Delivery {
  address: Address;
  source: AddressSource;
  id: bigint;
  txHash: Hex;
}

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
async function scanDeliveries(client: PublicClient): Promise<Delivery[]> {
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

/** Ownership is whatever the deployed contract says, since that is what actually controls it. */
async function keepOwnedBy(
  client: PublicClient,
  deliveries: Delivery[],
  account: Address,
): Promise<Delivery[]> {
  if (deliveries.length === 0) return [];

  const owners = await client.multicall({
    contracts: deliveries.map((delivery) => ({
      address: delivery.address,
      abi: ownedVaultAbi,
      functionName: "owner" as const,
    })),
  });

  return deliveries.filter((_, index) => {
    const entry = owners[index];
    return entry.status === "success" && entry.result.toLowerCase() === account.toLowerCase();
  });
}

async function attachSpecs(client: PublicClient, deliveries: Delivery[]): Promise<OwnedAddress[]> {
  if (deliveries.length === 0) return [];

  const records = await client.multicall({
    contracts: deliveries.map((delivery) => ({
      address: MARAS_ADDRESS as Address,
      abi: marasAbi,
      functionName: RECORD_READER[delivery.source],
      args: [delivery.id],
    })),
  });

  const owned: OwnedAddress[] = [];
  records.forEach((entry, index) => {
    if (entry.status !== "success") return;
    const record = entry.result as unknown as { spec: OnChainSpec };
    owned.push({ ...deliveries[index], spec: record.spec });
  });

  return owned;
}

export async function findOwnedAddresses(
  client: PublicClient,
  account: Address,
): Promise<OwnedAddress[]> {
  const deliveries = await scanDeliveries(client);
  const mine = await keepOwnedBy(client, deliveries, account);
  return (await attachSpecs(client, mine)).reverse();
}
