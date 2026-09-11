import { network } from "hardhat";
import { parseEventLogs, parseEther, type Address, type Hex } from "viem";

import { measureRate, mineSalt } from "../miner/mine.js";
import type { Spec } from "../shared/create3.js";
import { marasAbi } from "../shared/generated/abi.js";
import { describeEffort, expandLoose, expectedAttempts } from "../shared/leet.js";
import { commitHashFor, marketAddress, onChainSpec } from "../shared/market.js";

/**
 * Seller agent, run through Hardhat so the key comes from the keystore rather than an
 * environment variable. Configure with MINE_ZERO_BYTES / MINE_PATTERN / MINE_PRICE_ETH.
 */
const hookMaskEnv = process.env.MINE_HOOK_MASK;
const spec: Spec = {
  minZeroBytes: Number(process.env.MINE_ZERO_BYTES ?? 2),
  hookMask: hookMaskEnv === undefined ? undefined : Number(hookMaskEnv),
  patterns: expandLoose(process.env.MINE_PATTERN ?? "", process.env.MINE_LOOSE === "1"),
};
const priceEth = process.env.MINE_PRICE_ETH ?? "0.001";

const { viem } = await network.create({ network: "baseSepolia", chainType: "op" });
const publicClient = await viem.getPublicClient();
const [seller] = await viem.getWalletClients();

const market = marketAddress();
const maras = await viem.getContractAt("Maras", market as Address);

console.log(`Market   ${market}`);
console.log(`Seller   ${seller.account.address}`);
const attempts = expectedAttempts({
  minZeroBytes: spec.minZeroBytes,
  hookMask: spec.hookMask,
  patternNibbles: spec.patterns?.[0]?.replace(/^0x/, "").length ?? 0,
  variantCount: spec.patterns?.length ?? 0,
});

console.log(`Target   ${spec.minZeroBytes} leading zero bytes`);
if (spec.patterns !== undefined && spec.patterns.length > 0) {
  console.log(`Contains ${spec.patterns.map((p) => p.slice(2)).join(", ")}`);
}
if (spec.hookMask !== undefined) console.log(`Hook     0x${spec.hookMask.toString(16)}`);

const rate = measureRate(market as Address);
console.log(
  `Expected ~${Math.round(attempts).toLocaleString()} attempts, ${describeEffort(attempts, rate)} at ${Math.round(rate).toLocaleString()}/s on this machine\n`,
);

const startedAt = Date.now();
const mined = mineSalt(market as Address, spec, (attempts) => {
  const rate = Math.round(attempts / ((Date.now() - startedAt) / 1000));
  process.stdout.write(`\r  ${attempts.toLocaleString()} tried · ${rate.toLocaleString()}/s`);
});

console.log(
  `\n  found ${mined.address} in ${mined.attempts.toLocaleString()} attempts (${mined.seconds.toFixed(1)}s)\n`,
);

// The commitment has to land a block before the reveal, otherwise a mempool watcher could
// lift the salt out of the pending reveal and register it first.
const commitTx = await maras.write.commitSalt([commitHashFor(mined.salt, seller.account.address)]);
const commitReceipt = await publicClient.waitForTransactionReceipt({ hash: commitTx });
console.log(`Committed in block ${commitReceipt.blockNumber}`);

while ((await publicClient.getBlockNumber()) <= commitReceipt.blockNumber) {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

const listTx = await maras.write.listNamed([
  mined.salt,
  parseEther(priceEth),
  onChainSpec(spec),
]);
const listReceipt = await publicClient.waitForTransactionReceipt({ hash: listTx });
if (listReceipt.status !== "success") {
  throw new Error(`listNamed reverted in block ${listReceipt.blockNumber}`);
}

// Read the id from the event rather than the counter: a public RPC can serve the follow-up
// read from a node that has not caught up yet, which reports a stale count.
const [listed] = parseEventLogs({
  abi: marasAbi,
  eventName: "NamedListed",
  logs: listReceipt.logs,
});
console.log(`Listed #${listed.args.id} at ${priceEth} ETH`);
console.log(`Address  https://sepolia.basescan.org/address/${mined.address}`);
console.log(`Listing  https://sepolia.basescan.org/tx/${listTx}`);
