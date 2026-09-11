import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

import { network } from "hardhat";
import { parseEther, parseEventLogs, type Address, type Hex } from "viem";

import type { Spec } from "../shared/create3.js";
import { marasAbi } from "../shared/generated/abi.js";
import { listingPriceEth } from "../shared/leet.js";
import {
  commitHashFor,
  explorerUrl,
  marketAddress,
  onChainSpec,
  specFromChain,
  rebuildPayload,
  type OnChainSpec,
} from "../shared/market.js";

/**
 * Seller agent. Runs the Rust grinder, lists every rare byproduct in the named pool, and fills a
 * bounty if REQUEST_ID is set; without one it prospects until stopped.
 *
 *   REQUEST_ID=0 npx hardhat run miner/agent.ts --network baseSepolia
 *   LIST_ABOVE=30 npx hardhat run miner/agent.ts --network baseSepolia
 */

const MANIFEST = "miner/grinder/Cargo.toml";
const GRINDER = "miner/grinder/target/release/grinder";
const DEFAULT_LIST_ABOVE = 28;

interface TargetLine {
  type: "target";
  salt: Hex;
  address: Address;
}

interface FindLine {
  type: "find";
  salt: Hex;
  address: Address;
  rarityBits: number;
  minZeroBytes: number;
  hookMask: number | null;
  pattern: string | null;
  word: string | null;
}

interface RequestRecord {
  buyer: Address;
  bounty: bigint;
  spec: OnChainSpec;
  initCodeHash: Hex;
  filled: boolean;
}

interface Bounty {
  id: bigint;
  spec: Spec;
  initCode: Hex;
}

const { viem } = await network.create({ network: "baseSepolia", chainType: "op" });
const publicClient = await viem.getPublicClient();
const [seller] = await viem.getWalletClients();
const market = marketAddress();
const maras = await viem.getContractAt("Maras", market);

function grinderArgs(spec: Spec | undefined, listAbove: number): string[] {
  const args = ["--deployer", market, "--list-above", String(listAbove)];
  if (spec === undefined) return args;

  args.push("--zeros", String(spec.minZeroBytes));
  if (spec.hookMask !== undefined) args.push("--hook-mask", spec.hookMask.toString(16));
  for (const pattern of spec.patterns ?? []) args.push("--pattern", pattern.replace(/^0x/, ""));
  return args;
}

async function loadBounty(id: bigint): Promise<Bounty> {
  const request = (await maras.read.getRequest([id])) as unknown as RequestRecord;
  if (request.filled) throw new Error(`bounty #${id} is already filled`);

  // The buyer bound their payload by hash when posting, so only this exact code can fill it.
  const initCode = rebuildPayload(request.buyer, request.initCodeHash);
  if (initCode === undefined) {
    throw new Error(`bounty #${id} binds a payload this agent cannot rebuild`);
  }
  return { id, spec: specFromChain(request.spec), initCode };
}

async function waitForNextBlock(after: bigint): Promise<void> {
  while ((await publicClient.getBlockNumber()) <= after) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/**
 * The commitment has to land a block before the reveal, otherwise a mempool watcher could lift
 * the salt out of the pending reveal and register it first.
 */
async function commit(salt: Hex): Promise<void> {
  const hash = await maras.write.commitSalt([commitHashFor(salt, seller.account.address)]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  await waitForNextBlock(receipt.blockNumber);
}

function specOfFind(find: FindLine): Spec {
  return {
    minZeroBytes: find.minZeroBytes,
    hookMask: find.hookMask ?? undefined,
    patterns: find.pattern === null ? [] : [`0x${find.pattern}` as Hex],
  };
}

function describeFind(find: FindLine): string {
  const parts = [find.minZeroBytes === 1 ? "1 zero byte" : `${find.minZeroBytes} zero bytes`];
  if (find.word !== null) parts.push(`"${find.word}" as ${find.pattern}`);
  if (find.hookMask !== null) parts.push(`hook bits 0x${find.hookMask.toString(16)}`);
  return `${parts.join(", ")} (${find.rarityBits.toFixed(1)} bits)`;
}

async function listFind(find: FindLine): Promise<void> {
  const price = listingPriceEth(find.rarityBits);
  await commit(find.salt);

  const hash = await maras.write.listNamed([find.salt, parseEther(price), onChainSpec(specOfFind(find))]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [listed] = parseEventLogs({ abi: marasAbi, eventName: "NamedListed", logs: receipt.logs });
  console.log(`Listed #${listed.args.id} ${find.address} at ${price} ETH: ${describeFind(find)}`);
}

async function fillBounty(bounty: Bounty, target: TargetLine): Promise<void> {
  await commit(target.salt);

  const hash = await maras.write.fillRequest([bounty.id, target.salt, bounty.initCode]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`fillRequest reverted in ${hash}`);
  console.log(`Filled bounty #${bounty.id} at ${explorerUrl(target.address)}`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One wallet sends everything, so transactions go out in order to keep nonces straight. */
function serialQueue() {
  let tail = Promise.resolve();
  return (task: () => Promise<void>) => {
    tail = tail.then(task).catch((error: unknown) => console.error(`  skipped: ${messageOf(error)}`));
    return tail;
  };
}

function buildGrinder(): void {
  const build = spawnSync("cargo", ["build", "--release", "--quiet", "--manifest-path", MANIFEST], {
    stdio: "inherit",
  });
  if (build.status !== 0) throw new Error("the grinder did not build; is Rust installed?");
}

const requestId = process.env.REQUEST_ID;
const listAbove = Number(process.env.LIST_ABOVE ?? DEFAULT_LIST_ABOVE);
const bounty = requestId === undefined ? undefined : await loadBounty(BigInt(requestId));

buildGrinder();
console.log(`Seller ${seller.account.address}, listing finds above ${listAbove} bits`);
if (bounty !== undefined) console.log(`Grinding for bounty #${bounty.id}`);

const grinder = spawn(GRINDER, grinderArgs(bounty?.spec, listAbove), {
  stdio: ["ignore", "pipe", "inherit"],
});
const enqueue = serialQueue();
let drained = Promise.resolve();

function handle(result: TargetLine | FindLine): Promise<void> {
  if (result.type === "find") return enqueue(() => listFind(result));
  if (bounty === undefined) return drained;
  return enqueue(() => fillBounty(bounty, result));
}

for await (const line of createInterface({ input: grinder.stdout })) {
  drained = handle(JSON.parse(line) as TargetLine | FindLine);
}

await drained;
