import { createPublicClient, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";
import { baseSepoliaTransport } from "@/lib/rpc";

export const market = MARAS_ADDRESS as Address;

export const client = createPublicClient({
  chain: baseSepolia,
  transport: baseSepoliaTransport(),
  batch: { multicall: true },
});

export interface OnChainSpecRecord {
  minZeroBytes: number;
  hookMask: number;
  checkHookMask: boolean;
  patterns: readonly string[];
  patternCount: number;
  patternNibbles: number;
}

export interface NamedListing {
  seller: Address;
  price: bigint;
  salt: Hex;
  predicted: Address;
  sold: boolean;
  spec: OnChainSpecRecord;
}

export interface SealedListing {
  seller: Address;
  price: bigint;
  bond: bigint;
  commitHash: Hex;
  spec: OnChainSpecRecord;
  buyer: Address;
  initCodeHash: Hex;
  deadline: bigint;
  settled: boolean;
}

export interface RequestRecord {
  buyer: Address;
  bounty: bigint;
  spec: OnChainSpecRecord;
  initCodeHash: Hex;
  filled: boolean;
}

export type CountName = "namedListingCount" | "sealedListingCount" | "requestCount";
type GetterName = "getNamedListing" | "getSealedListing" | "getRequest";

export interface Identified<T> {
  id: bigint;
  record: T;
}

export async function readCount(name: CountName): Promise<bigint> {
  return (await client.readContract({
    address: market,
    abi: marasAbi,
    functionName: name,
  })) as bigint;
}

async function readOne<T>(getter: GetterName, id: bigint): Promise<T> {
  return (await client.readContract({
    address: market,
    abi: marasAbi,
    functionName: getter,
    args: [id],
  })) as unknown as T;
}

/**
 * One aggregated call rather than one per id. Awaiting each in turn issued a separate request
 * per record, which the public endpoint answered with a rate limit once inventory grew.
 */
async function readAll<T>(getter: GetterName, count: bigint): Promise<Identified<T>[]> {
  const ids = Array.from({ length: Number(count) }, (_, index) => BigInt(index));
  const results = await client.multicall({
    contracts: ids.map((id) => ({
      address: market,
      abi: marasAbi,
      functionName: getter,
      args: [id] as const,
    })),
  });

  const found: Identified<T>[] = [];
  results.forEach((entry, index) => {
    if (entry.status !== "success") return;
    found.push({ id: ids[index], record: entry.result as unknown as T });
  });

  return found;
}

/**
 * Solidity reverts on an out-of-range index, and viem surfaces that as a wall of call detail an
 * agent can do nothing with. Checking the count first turns the common mistake — asking about id
 * 0 of a collection that is still empty — into a sentence.
 */
async function requireId(count: CountName, one: string, many: string, id: bigint): Promise<void> {
  const total = await readCount(count);
  if (id < total) return;
  if (total === 0n) throw new Error(`There are no ${many} yet, so #${id} does not exist.`);
  throw new Error(`${one} #${id} does not exist. The highest is #${total - 1n}.`);
}

export async function readNamed(id: bigint): Promise<NamedListing> {
  await requireId("namedListingCount", "Listing", "listings", id);
  return readOne<NamedListing>("getNamedListing", id);
}

export async function readSealed(id: bigint): Promise<SealedListing> {
  await requireId("sealedListingCount", "Sealed listing", "sealed listings", id);
  return readOne<SealedListing>("getSealedListing", id);
}

export async function readRequest(id: bigint): Promise<RequestRecord> {
  await requireId("requestCount", "Bounty", "bounties", id);
  return readOne<RequestRecord>("getRequest", id);
}

export async function readAllNamed(): Promise<Identified<NamedListing>[]> {
  return readAll<NamedListing>("getNamedListing", await readCount("namedListingCount"));
}

export async function readAllSealed(): Promise<Identified<SealedListing>[]> {
  return readAll<SealedListing>("getSealedListing", await readCount("sealedListingCount"));
}

export async function readAllRequests(): Promise<Identified<RequestRecord>[]> {
  return readAll<RequestRecord>("getRequest", await readCount("requestCount"));
}
