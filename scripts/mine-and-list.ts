import { network } from "hardhat";
import { formatEther, parseEther, type Address, type Hex } from "viem";

import { mineSalt, expectedAttempts } from "../miner/mine.js";
import { commitHashFor, marketAddress, onChainSpec } from "../shared/market.js";
import type { Spec } from "../shared/create3.js";

/**
 * Seller agent, run through Hardhat so the key comes from the keystore rather than an
 * environment variable. Configure with MINE_ZERO_BYTES / MINE_PATTERN / MINE_PRICE_ETH.
 */
const spec: Spec = {
  minZeroBytes: Number(process.env.MINE_ZERO_BYTES ?? 2),
  pattern: process.env.MINE_PATTERN as Hex | undefined,
};
const priceEth = process.env.MINE_PRICE_ETH ?? "0.001";

const { viem } = await network.create({ network: "baseSepolia", chainType: "op" });
const publicClient = await viem.getPublicClient();
const [seller] = await viem.getWalletClients();

const market = marketAddress();
const maras = await viem.getContractAt("Maras", market as Address);

console.log(`Market   ${market}`);
console.log(`Seller   ${seller.account.address}`);
console.log(`Target   ${spec.minZeroBytes} leading zero bytes${spec.pattern ? ` containing ${spec.pattern}` : ""}`);
console.log(`Expected ~${expectedAttempts(spec).toLocaleString()} attempts\n`);

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
await publicClient.waitForTransactionReceipt({ hash: listTx });

const count = await maras.read.namedListingCount();
console.log(`Listed #${count - 1n} at ${formatEther(parseEther(priceEth))} ETH`);
console.log(`Address  https://sepolia.basescan.org/address/${mined.address}`);
console.log(`Listing  https://sepolia.basescan.org/tx/${listTx}`);
