import { network } from "hardhat";
import { formatEther, keccak256, parseEventLogs, type Address, type Hex } from "viem";

import { mineSalt } from "../miner/mine.js";
import { marasAbi } from "../shared/generated/abi.js";
import { describeEffort, expectedAttempts } from "../shared/leet.js";
import {
  commitHashFor,
  marketAddress,
  specFromChain,
  rebuildPayload,
  type OnChainSpec,
} from "../shared/market.js";

interface RequestRecord {
  buyer: Address;
  bounty: bigint;
  spec: OnChainSpec;
  initCodeHash: Hex;
  filled: boolean;
}

const { viem } = await network.create({ network: "baseSepolia", chainType: "op" });
const publicClient = await viem.getPublicClient();
const [seller] = await viem.getWalletClients();

const market = marketAddress() as Address;
const maras = await viem.getContractAt("Maras", market);

const count = Number(await maras.read.requestCount());
if (count === 0) {
  console.log("No requests posted yet.");
  process.exit(0);
}

const wanted = process.env.REQUEST_ID;
const candidates = wanted === undefined ? [...Array(count).keys()] : [Number(wanted)];

let target: { id: number; request: RequestRecord } | undefined;
for (const id of candidates) {
  const request = (await maras.read.getRequest([BigInt(id)])) as unknown as RequestRecord;
  if (!request.filled) {
    target = { id, request };
    break;
  }
}

if (target === undefined) {
  console.log("Every request is already filled.");
  process.exit(0);
}

const { id, request } = target;
const spec = specFromChain(request.spec);

// The buyer bound their payload by hash when posting, so only this exact code can fill it.
const initCode = rebuildPayload(request.buyer, request.initCodeHash);
if (initCode === undefined) {
  console.log(`Request ${id} binds a payload this script cannot reconstruct.`);
  console.log(`  bound hash ${request.initCodeHash}`);
  process.exit(1);
}

const attempts = expectedAttempts({
  minZeroBytes: spec.minZeroBytes,
  hookMask: spec.hookMask,
  patternNibbles: spec.patterns?.[0]?.replace(/^0x/, "").length ?? 0,
  variantCount: spec.patterns?.length ?? 0,
});

console.log(`Request  #${id} from ${request.buyer}`);
console.log(`Bounty   ${formatEther(request.bounty)} ETH`);
console.log(`Target   ${spec.minZeroBytes} zero bytes${spec.patterns?.length ? `, contains ${spec.patterns.map((p) => p.slice(2)).join(" or ")}` : ""}`);
console.log(`Expected ${describeEffort(attempts)} on one GPU\n`);

const startedAt = Date.now();
const mined = mineSalt(market, spec, (tried) => {
  const rate = Math.round(tried / ((Date.now() - startedAt) / 1000));
  process.stdout.write(`\r  ${tried.toLocaleString()} tried · ${rate.toLocaleString()}/s`);
});
console.log(`\n  found ${mined.address} in ${mined.attempts.toLocaleString()} attempts\n`);

const commitTx = await maras.write.commitSalt([commitHashFor(mined.salt, seller.account.address)]);
const commitReceipt = await publicClient.waitForTransactionReceipt({ hash: commitTx });
console.log(`Committed in block ${commitReceipt.blockNumber}`);

while ((await publicClient.getBlockNumber()) <= commitReceipt.blockNumber) {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

const fillTx = await maras.write.fillRequest([BigInt(id), mined.salt, initCode]);
const fillReceipt = await publicClient.waitForTransactionReceipt({ hash: fillTx });
if (fillReceipt.status !== "success") {
  throw new Error(`fillRequest reverted in block ${fillReceipt.blockNumber}`);
}

const [filled] = parseEventLogs({
  abi: marasAbi,
  eventName: "RequestFilled",
  logs: fillReceipt.logs,
});

console.log(`Filled request #${id}, collected ${formatEther(request.bounty)} ETH`);
console.log(`Deployed https://sepolia.basescan.org/address/${filled.args.deployed}`);
