import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";

import { marasAbi } from "../shared/generated/abi.js";
import { marketAddress } from "../shared/market.js";

const address = marketAddress() as Address;
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
});

console.log(`Reading ${address} on Base Sepolia\n`);

const counters = ["namedListingCount", "sealedListingCount", "requestCount"] as const;
for (const name of counters) {
  const value = await client.readContract({ address, abi: marasAbi, functionName: name });
  console.log(`${name.padEnd(20)} ${value}`);
}

const window = await client.readContract({
  address,
  abi: marasAbi,
  functionName: "DELIVERY_WINDOW",
});
console.log(`${"DELIVERY_WINDOW".padEnd(20)} ${window} seconds`);

const salt = `0x${"0".repeat(63)}7` as const;
const predicted = await client.readContract({
  address,
  abi: marasAbi,
  functionName: "predictAddress",
  args: [salt],
});
console.log(`\npredictAddress(salt 7) -> ${predicted}`);
