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
}

/** Words spellable in hex, which is the whole vocabulary available to an address. */
const LOOSE_WORDS = [
  "ace", "bad", "bed", "bee", "cab", "dad", "fad", "fed", "add", "b0b",
  "bead", "beef", "cafe", "dead", "deed", "face", "fade", "feed", "deaf", "cede",
  "decaf", "facade", "deadbee", "accede",
];

const EXACT_WORDS = ["cafe", "beef", "face", "feed", "dead", "deadbeef", "cafebabe", "deadfeed"];

const HOOK_MASKS = [0x2400, 0x00c0, 0x0300, 0x10c0, 0x3000, 0x0c00];

function wordTargets(): Target[] {
  const loose = LOOSE_WORDS.map((word) => ({
    label: word,
    spec: { minZeroBytes: 0, patterns: expandLoose(word, true) } satisfies Spec,
  }));

  // An exact spelling is roughly sixteen times rarer than the same word loosely matched.
  const exact = EXACT_WORDS.map((word) => ({
    label: `${word} exactly`,
    spec: { minZeroBytes: 0, patterns: expandLoose(word, false) } satisfies Spec,
  }));

  return [...loose, ...exact];
}

function zeroTargets(): Target[] {
  return [
    { label: "1 zero byte", spec: { minZeroBytes: 1 } },
    { label: "2 zero bytes", spec: { minZeroBytes: 2 } },
    { label: "2 zero bytes", spec: { minZeroBytes: 2 } },
    { label: "3 zero bytes", spec: { minZeroBytes: 3 } },
    { label: "3 zero bytes", spec: { minZeroBytes: 3 } },
    { label: "3 zero bytes", spec: { minZeroBytes: 3 } },
    { label: "4 zero bytes", spec: { minZeroBytes: 4 } },
  ];
}

function comboTargets(): Target[] {
  const combos: Target[] = [];

  for (const word of ["cafe", "beef", "face", "dead"]) {
    combos.push({
      label: `1 zero byte + ${word}`,
      spec: { minZeroBytes: 1, patterns: expandLoose(word, true) },
    });
    combos.push({
      label: `2 zero bytes + ${word}`,
      spec: { minZeroBytes: 2, patterns: expandLoose(word, true) },
    });
  }

  for (const mask of HOOK_MASKS) {
    combos.push({
      label: `V4 hook bits 0x${mask.toString(16).padStart(4, "0")}`,
      spec: { minZeroBytes: 0, hookMask: mask },
    });
  }

  combos.push({
    label: "1 zero byte + V4 hook bits",
    spec: { minZeroBytes: 1, hookMask: 0x2400 },
  });
  combos.push({
    label: "V4 hook bits + cafe",
    spec: { minZeroBytes: 0, hookMask: 0x00c0, patterns: expandLoose("cafe", true) },
  });

  return combos;
}

function attemptsFor(spec: Spec): number {
  return expectedAttempts({
    minZeroBytes: spec.minZeroBytes,
    hookMask: spec.hookMask,
    patternNibbles: spec.patterns?.[0]?.replace(/^0x/, "").length ?? 0,
    variantCount: spec.patterns?.length ?? 0,
  });
}

/** Rarity is the only thing a buyer is paying for, so price tracks the grind it took. */
function priceFor(attempts: number): string {
  const eth = Math.min(0.09, Math.max(0.0002, attempts / 5e10));
  return eth.toFixed(5);
}

const { viem } = await network.create({ network: "baseSepolia", chainType: "op" });
const publicClient = await viem.getPublicClient();
const [seller] = await viem.getWalletClients();

const market = marketAddress() as Address;
const maras = await viem.getContractAt("Maras", market);
const rate = measureRate(market);

const budgetHours = Number(process.env.BULK_HOURS ?? 7);
const deadline = Date.now() + budgetHours * 3_600_000;

const queue = [...wordTargets(), ...zeroTargets(), ...comboTargets()]
  .map((target) => ({ ...target, attempts: attemptsFor(target.spec) }))
  .sort((a, b) => a.attempts - b.attempts);

console.log(`Market  ${market}`);
console.log(`Seller  ${seller.account.address}`);
console.log(`Rate    ${Math.round(rate).toLocaleString()}/s`);
console.log(`Budget  ${budgetHours}h for ${queue.length} targets, cheapest first\n`);

const listed: string[] = [];
const skipped: string[] = [];

for (const [index, target] of queue.entries()) {
  const remainingMs = deadline - Date.now();
  const expectedMs = (target.attempts / rate) * 1000;
  const position = `${index + 1}/${queue.length}`;

  if (expectedMs > remainingMs) {
    console.log(`[${position}] ${target.label} — needs ${describeEffort(target.attempts, rate)}, past the budget. Stopping.`);
    skipped.push(`${target.label} (too long)`);
    break;
  }

  const priceEth = priceFor(target.attempts);
  console.log(`[${position}] ${target.label} — ${describeEffort(target.attempts, rate)} at ${priceEth} ETH`);

  try {
    const startedAt = Date.now();
    const mined = mineSalt(market, target.spec, (tried) => {
      const speed = Math.round(tried / ((Date.now() - startedAt) / 1000));
      process.stdout.write(`\r      ${tried.toLocaleString()} tried · ${speed.toLocaleString()}/s   `);
    });
    process.stdout.write(`\r${" ".repeat(58)}\r`);
    console.log(`      ${mined.address} in ${mined.attempts.toLocaleString()} attempts`);

    const commitTx = await maras.write.commitSalt([
      commitHashFor(mined.salt, seller.account.address),
    ]);
    const commitReceipt = await publicClient.waitForTransactionReceipt({ hash: commitTx });

    while ((await publicClient.getBlockNumber()) <= commitReceipt.blockNumber) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    const listTx = await maras.write.listNamed([
      mined.salt,
      parseEther(priceEth),
      onChainSpec(target.spec),
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: listTx });
    if (receipt.status !== "success") throw new Error(`listNamed reverted in ${receipt.blockNumber}`);

    const [event] = parseEventLogs({ abi: marasAbi, eventName: "NamedListed", logs: receipt.logs });
    console.log(`      listed #${event.args.id} at ${formatEther(parseEther(priceEth))} ETH\n`);
    listed.push(`${target.label} → ${mined.address}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.log(`      skipped: ${message}\n`);
    skipped.push(`${target.label}: ${message}`);
  }
}

console.log(`\nListed ${listed.length} of ${queue.length}`);
listed.forEach((line) => console.log(`  ${line}`));
if (skipped.length > 0) {
  console.log(`\nSkipped ${skipped.length}`);
  skipped.forEach((line) => console.log(`  ${line}`));
}
