import { existsSync, readFileSync } from "node:fs";

import { network } from "hardhat";
import { formatEther, getAddress, keccak256, type Address, type Hex } from "viem";

import { marketAddress, rebuildPayload } from "../shared/market.js";

/**
 * Seller side of the delivery window. Waits for someone to buy the sealed listing, then reveals
 * the salt and deploys the buyer's payload at the mined address in one transaction.
 *
 * The buyer bound their creation code by hash when they paid, so the code deployed here is theirs
 * and cannot be swapped. Miss the window and the buyer reclaims both the price and the bond.
 */
const SALT_FILE = "deployments/sealed.local.json";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const POLL_MS = 3_000;

interface SealedRecord {
  id: string;
  salt: Hex;
  address: Address;
  seller: Address;
  priceEth: string;
}

function loadRecords(): SealedRecord[] {
  if (!existsSync(SALT_FILE)) return [];
  return JSON.parse(readFileSync(SALT_FILE, "utf8")) as SealedRecord[];
}

function chosenRecord(): SealedRecord {
  const records = loadRecords();
  if (records.length === 0) {
    throw new Error(`no sealed salts in ${SALT_FILE} — run scripts/list-sealed.ts first`);
  }

  const wanted = process.env.SEALED_ID;
  if (wanted === undefined) return records[records.length - 1];

  const found = records.find((entry) => entry.id === wanted);
  if (found === undefined) throw new Error(`no salt recorded for sealed listing #${wanted}`);
  return found;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function secondsLeft(deadline: bigint): number {
  return Number(deadline) - Math.floor(Date.now() / 1000);
}

const record = chosenRecord();
const id = BigInt(record.id);

const { viem } = await network.create({ network: "baseSepolia", chainType: "op" });
const publicClient = await viem.getPublicClient();
const [seller] = await viem.getWalletClients();
const maras = await viem.getContractAt("Maras", marketAddress());

console.log(`Sealed #${record.id} promising ${record.address}`);
console.log(`Seller  ${seller.account.address}`);
console.log(`Waiting for a buyer. Leave this running.\n`);

let listing = await maras.read.getSealedListing([id]);

while (listing.buyer === ZERO_ADDRESS && !listing.settled) {
  process.stdout.write(`\r  no buyer yet · ${new Date().toLocaleTimeString()}`);
  await sleep(POLL_MS);
  listing = await maras.read.getSealedListing([id]);
}
process.stdout.write(`\r${" ".repeat(48)}\r`);

if (listing.settled) throw new Error(`sealed #${record.id} is already settled`);

const remaining = secondsLeft(listing.deadline);
console.log(`Bought by ${listing.buyer} for ${formatEther(listing.price)} ETH`);
console.log(`${remaining}s left to deliver\n`);
if (remaining <= 0) throw new Error("the delivery window has already closed");

// The buyer committed this exact creation code by hash when they paid, so rebuilding it from
// their address has to reproduce the hash the contract will check.
const initCode = rebuildPayload(getAddress(listing.buyer), listing.initCodeHash);
if (initCode === undefined) {
  throw new Error(
    `the buyer bound a payload this script cannot rebuild (${listing.initCodeHash}); deliver it manually`,
  );
}

const deliverTx = await maras.write.deliverSealed([id, record.salt, initCode]);
const receipt = await publicClient.waitForTransactionReceipt({ hash: deliverTx });
if (receipt.status !== "success") {
  throw new Error(`deliverSealed reverted in block ${receipt.blockNumber}`);
}

console.log(`Delivered ${record.address} to ${listing.buyer}`);
console.log(`Paid ${formatEther(listing.price + listing.bond)} ETH, bond returned`);
console.log(`Contract https://sepolia.basescan.org/address/${record.address}`);
console.log(`Transaction https://sepolia.basescan.org/tx/${deliverTx}`);
