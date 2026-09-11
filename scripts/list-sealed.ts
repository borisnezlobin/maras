import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { network } from "hardhat";
import { parseEther, parseEventLogs, type Address, type Hex } from "viem";

import { measureRate, mineSalt } from "../miner/mine.js";
import type { Spec } from "../shared/create3.js";
import { marasAbi } from "../shared/generated/abi.js";
import { describeEffort, expandLoose, expectedAttempts, listingPriceEth } from "../shared/leet.js";
import { commitHashFor, marketAddress, onChainSpec } from "../shared/market.js";

/**
 * Seller side of the sealed flow: mine an address, publish only a commitment to it, and post a
 * bond against delivering. Nothing about the address reaches the chain, so a buyer genuinely
 * cannot inspect it before paying.
 *
 * Unlike a named listing this is one transaction. `deliverSealed` checks the salt against the
 * commitment stored in the listing itself, so there is no separate `commitSalt` to front-run.
 */
const SALT_FILE = "deployments/sealed.local.json";

interface SealedRecord {
  id: string;
  salt: Hex;
  address: Address;
  market: Address;
  seller: Address;
  priceEth: string;
  bondEth: string;
}

function loadRecords(): SealedRecord[] {
  if (!existsSync(SALT_FILE)) return [];
  return JSON.parse(readFileSync(SALT_FILE, "utf8")) as SealedRecord[];
}

/**
 * The salt is the whole secret here, so it stays in a gitignored file. Publishing it would let
 * anyone derive the address before paying, which is the one thing a sealed listing sells.
 */
function saveRecord(record: SealedRecord): void {
  const kept = loadRecords().filter((entry) => entry.id !== record.id);
  kept.push(record);
  writeFileSync(SALT_FILE, `${JSON.stringify(kept, null, 2)}\n`);
}

function requestedSpec(): Spec {
  const hookMask = process.env.SEALED_HOOK_MASK;
  return {
    minZeroBytes: Number(process.env.SEALED_ZERO_BYTES ?? 2),
    hookMask: hookMask === undefined ? undefined : Number(hookMask),
    patterns: expandLoose(process.env.SEALED_PATTERN ?? "", process.env.SEALED_LOOSE === "1"),
  };
}

const spec = requestedSpec();
const bondEth = process.env.SEALED_BOND_ETH ?? "0.002";

const { viem } = await network.create({ network: "baseSepolia", chainType: "op" });
const publicClient = await viem.getPublicClient();
const [seller] = await viem.getWalletClients();

const market = marketAddress();
const maras = await viem.getContractAt("Maras", market);

const attempts = expectedAttempts({
  minZeroBytes: spec.minZeroBytes,
  hookMask: spec.hookMask,
  patternNibbles: spec.patterns?.[0]?.replace(/^0x/, "").length ?? 0,
  variantCount: spec.patterns?.length ?? 0,
});

// Priced from what the spec promises, which is all a buyer can count on before paying.
const priceEth = process.env.SEALED_PRICE_ETH ?? listingPriceEth(Math.log2(attempts));
const rate = measureRate(market);

console.log(`Market   ${market}`);
console.log(`Seller   ${seller.account.address}`);
console.log(`Promise  ${spec.minZeroBytes} leading zero bytes`);
console.log(`Price    ${priceEth} ETH, ${bondEth} ETH bond at risk`);
console.log(`Expected ${describeEffort(attempts, rate)} on this machine\n`);

const startedAt = Date.now();
const mined = mineSalt(market, spec, (tried) => {
  const speed = Math.round(tried / ((Date.now() - startedAt) / 1000));
  process.stdout.write(`\r  ${tried.toLocaleString()} tried · ${speed.toLocaleString()}/s`);
});
process.stdout.write(`\r${" ".repeat(52)}\r`);
console.log(`Mined    ${mined.address} in ${mined.attempts.toLocaleString()} attempts`);

const listTx = await maras.write.listSealed(
  [commitHashFor(mined.salt, seller.account.address), parseEther(priceEth), onChainSpec(spec)],
  { value: parseEther(bondEth) },
);
const receipt = await publicClient.waitForTransactionReceipt({ hash: listTx });
if (receipt.status !== "success") {
  throw new Error(`listSealed reverted in block ${receipt.blockNumber}`);
}

// Read the id from the event rather than the counter: a public RPC can answer the follow-up read
// from a node that has not caught up, which reports a stale count.
const [listed] = parseEventLogs({ abi: marasAbi, eventName: "SealedListed", logs: receipt.logs });
const id = listed.args.id.toString();

saveRecord({
  id,
  salt: mined.salt,
  address: mined.address,
  market,
  seller: seller.account.address,
  priceEth,
  bondEth,
});

console.log(`\nListed sealed #${id} at ${priceEth} ETH`);
console.log(`Salt kept in ${SALT_FILE}, which git ignores`);
console.log(`Transaction https://sepolia.basescan.org/tx/${listTx}`);
console.log(`\nA buyer has ten minutes of your time once they pay. Start the watcher now:`);
console.log(`  SEALED_ID=${id} npx hardhat run scripts/deliver-sealed.ts --network baseSepolia`);
