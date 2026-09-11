import { formatEther, keccak256, type Address, type Hex } from "viem";

import type { Spec } from "../shared/create3.js";
import {
  chainClients,
  commitHashFor,
  explorerUrl,
  marasAbi,
  marketAddress,
  onChainSpec,
  specFromChain,
  vaultInitCode,
  type OnChainSpec,
} from "../shared/market.js";
import { expectedAttempts, mineSalt } from "./mine.js";

function reportProgress(attempts: number, startedAt: number): void {
  const rate = Math.round(attempts / ((Date.now() - startedAt) / 1000));
  process.stdout.write(`\r  ${attempts.toLocaleString()} attempts · ${rate.toLocaleString()}/s`);
}

function mineForSpec(market: Address, spec: Spec) {
  console.log(`  expected attempts ≈ ${expectedAttempts(spec).toLocaleString()}`);
  const startedAt = Date.now();
  const mined = mineSalt(market, spec, (attempts) => reportProgress(attempts, startedAt));
  console.log(
    `\n  found ${mined.address} in ${mined.attempts.toLocaleString()} attempts (${mined.seconds.toFixed(1)}s)`,
  );
  return mined;
}

/**
 * The commitment must land at least one block before the reveal. Without that gap a mempool
 * watcher could lift the salt out of the pending reveal and register it first.
 */
async function commitAndWaitOneBlock(salt: Hex, market: Address) {
  const { account, publicClient, walletClient } = chainClients();

  const hash = await walletClient.writeContract({
    address: market,
    abi: marasAbi,
    functionName: "commitSalt",
    args: [commitHashFor(salt, account.address)],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  committed in block ${receipt.blockNumber}`);

  while ((await publicClient.getBlockNumber()) <= receipt.blockNumber) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function mineAndList(spec: Spec, priceWei: bigint) {
  const market = marketAddress();
  console.log(`Mining against ${market}`);

  const mined = mineForSpec(market, spec);
  await commitAndWaitOneBlock(mined.salt, market);

  const { publicClient, walletClient } = chainClients();
  const hash = await walletClient.writeContract({
    address: market,
    abi: marasAbi,
    functionName: "listNamed",
    args: [mined.salt, priceWei, onChainSpec(spec)],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  console.log(`  listed at ${formatEther(priceWei)} ETH`);
  console.log(`  ${explorerUrl(mined.address)}`);
}

type RequestTuple = [Address, bigint, OnChainSpec, Hex, boolean];

async function fillOpenRequests() {
  const market = marketAddress();
  const { publicClient, walletClient } = chainClients();

  const count = (await publicClient.readContract({
    address: market,
    abi: marasAbi,
    functionName: "requestCount",
  })) as bigint;

  for (let id = 0n; id < count; id++) {
    const [buyer, bounty, spec, initCodeHash, filled] = (await publicClient.readContract({
      address: market,
      abi: marasAbi,
      functionName: "requests",
      args: [id],
    })) as unknown as RequestTuple;

    if (filled) continue;

    console.log(`Request ${id} from ${buyer} · bounty ${formatEther(bounty)} ETH`);
    const mined = mineForSpec(market, specFromChain(spec));
    await commitAndWaitOneBlock(mined.salt, market);

    const initCode = vaultInitCode(buyer);
    if (keccak256(initCode) !== initCodeHash.toLowerCase()) {
      console.log("  skipping: buyer bound a payload this agent cannot reconstruct");
      console.log(`  bound hash ${initCodeHash}`);
      continue;
    }

    const hash = await walletClient.writeContract({
      address: market,
      abi: marasAbi,
      functionName: "fillRequest",
      args: [id, mined.salt, initCode],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  filled request ${id} → ${explorerUrl(mined.address)}`);
  }
}

const [command, ...rest] = process.argv.slice(2);

if (command === "list") {
  const zeroBytes = Number(rest[0] ?? 2);
  const priceEth = rest[1] ?? "0.001";
  await mineAndList({ minZeroBytes: zeroBytes }, BigInt(Math.round(Number(priceEth) * 1e18)));
} else if (command === "fill") {
  await fillOpenRequests();
} else {
  console.log("usage: tsx miner/agent.ts list [zeroBytes] [priceEth]");
  console.log("       tsx miner/agent.ts fill");
}
