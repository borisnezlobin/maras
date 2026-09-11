import { network } from "hardhat";
import { formatEther, parseEther, parseEventLogs, type Address, type Hex } from "viem";

import { measureRate, mineSalt } from "../miner/mine.js";
import type { Spec } from "../shared/create3.js";
import { marasAbi } from "../shared/generated/abi.js";
import { describeEffort, expandLoose, expectedAttempts } from "../shared/leet.js";
import { commitHashFor, marketAddress, onChainSpec } from "../shared/market.js";

interface Target {
  label: string;
  spec: Spec;
  priceEth: string;
}

function word(text: string, loose: boolean): Hex[] {
  return expandLoose(text, loose);
}

/**
 * A spread wide enough that the market looks like a market: cheap common ones, a couple of
 * genuinely rare ones, words, lookalike spellings, and hook permission sets.
 */
function targets(): Target[] {
  return [
    { label: "b0b", spec: { minZeroBytes: 0, patterns: word("b0b", true) }, priceEth: "0.0004" },
    { label: "cafe", spec: { minZeroBytes: 0, patterns: word("cafe", true) }, priceEth: "0.0008" },
    { label: "face", spec: { minZeroBytes: 0, patterns: word("face", true) }, priceEth: "0.0008" },
    { label: "feed", spec: { minZeroBytes: 0, patterns: word("feed", true) }, priceEth: "0.0008" },
    { label: "2 zero bytes", spec: { minZeroBytes: 2 }, priceEth: "0.0015" },
    { label: "2 zero bytes + beef", spec: { minZeroBytes: 2, patterns: word("beef", true) }, priceEth: "0.006" },
    { label: "V4 hook bits 0x2400", spec: { minZeroBytes: 0, hookMask: 0x2400 }, priceEth: "0.002" },
    { label: "V4 hook bits 0x00c0", spec: { minZeroBytes: 0, hookMask: 0x00c0 }, priceEth: "0.002" },
    { label: "1 zero byte + V4 bits", spec: { minZeroBytes: 1, hookMask: 0x2400 }, priceEth: "0.005" },
    { label: "deadbee", spec: { minZeroBytes: 0, patterns: word("deadbee", true) }, priceEth: "0.009" },
    { label: "deadbeef", spec: { minZeroBytes: 0, patterns: word("deadbeef", true) }, priceEth: "0.02" },
    { label: "3 zero bytes", spec: { minZeroBytes: 3 }, priceEth: "0.012" },
    { label: "3 zero bytes", spec: { minZeroBytes: 3 }, priceEth: "0.014" },
  ];
}

/** Only worth starting if you really are leaving it overnight. */
function hardTargets(): Target[] {
  return [
    { label: "4 zero bytes", spec: { minZeroBytes: 4 }, priceEth: "0.08" },
    { label: "2 zero bytes + cafe", spec: { minZeroBytes: 2, patterns: word("cafe", true) }, priceEth: "0.05" },
  ];
}

function attemptsFor(spec: Spec): number {
  return expectedAttempts({
    minZeroBytes: spec.minZeroBytes,
    hookMask: spec.hookMask,
    patternNibbles: spec.patterns?.[0]?.replace(/^0x/, "").length ?? 0,
    variantCount: spec.patterns?.length ?? 0,
  });
}

const { viem } = await network.create({ network: "baseSepolia", chainType: "op" });
const publicClient = await viem.getPublicClient();
const [seller] = await viem.getWalletClients();

const market = marketAddress() as Address;
const maras = await viem.getContractAt("Maras", market);
const rate = measureRate(market);

const list = process.env.BULK_HARD === "1" ? [...targets(), ...hardTargets()] : targets();

console.log(`Market  ${market}`);
console.log(`Seller  ${seller.account.address}`);
console.log(`Rate    ${Math.round(rate).toLocaleString()}/s on this machine`);
console.log(`Listing ${list.length} targets\n`);

const listed: string[] = [];
const failed: string[] = [];

for (const [index, target] of list.entries()) {
  const attempts = attemptsFor(target.spec);
  const position = `${index + 1}/${list.length}`;
  console.log(`[${position}] ${target.label} — ${describeEffort(attempts, rate)} expected`);

  try {
    const startedAt = Date.now();
    const mined = mineSalt(market, target.spec, (tried) => {
      const speed = Math.round(tried / ((Date.now() - startedAt) / 1000));
      process.stdout.write(`\r      ${tried.toLocaleString()} tried · ${speed.toLocaleString()}/s`);
    });
    process.stdout.write("\r".padEnd(60) + "\r");
    console.log(`      found ${mined.address} in ${mined.attempts.toLocaleString()} attempts`);

    const commitTx = await maras.write.commitSalt([
      commitHashFor(mined.salt, seller.account.address),
    ]);
    const commitReceipt = await publicClient.waitForTransactionReceipt({ hash: commitTx });

    while ((await publicClient.getBlockNumber()) <= commitReceipt.blockNumber) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    const listTx = await maras.write.listNamed([
      mined.salt,
      parseEther(target.priceEth),
      onChainSpec(target.spec),
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: listTx });

    if (receipt.status !== "success") throw new Error(`listNamed reverted in ${receipt.blockNumber}`);

    const [event] = parseEventLogs({ abi: marasAbi, eventName: "NamedListed", logs: receipt.logs });
    console.log(`      listed #${event.args.id} at ${formatEther(parseEther(target.priceEth))} ETH\n`);
    listed.push(`${target.label} → ${mined.address}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.log(`      skipped: ${message}\n`);
    failed.push(`${target.label}: ${message}`);
  }
}

console.log(`\nListed ${listed.length} of ${list.length}`);
listed.forEach((line) => console.log(`  ${line}`));
if (failed.length > 0) {
  console.log(`\nSkipped ${failed.length}`);
  failed.forEach((line) => console.log(`  ${line}`));
}
