import { createPublicClient, formatEther, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

/**
 * An agent can hold its own key rather than borrowing one. It still needs gas before it can
 * transact, so the address has to be funded once before it can earn anything.
 */
const existing = process.env.BASE_SEPOLIA_PRIVATE_KEY;

if (existing !== undefined && existing !== "") {
  const account = privateKeyToAccount(existing as `0x${string}`);
  console.log(`Using the key already in BASE_SEPOLIA_PRIVATE_KEY: ${account.address}`);
} else {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);

  console.log("A new Base Sepolia wallet:\n");
  console.log(`  address      ${account.address}`);
  console.log(`  private key  ${key}\n`);
  console.log("Save the key somewhere the agent can read it, for example:");
  console.log(`  export BASE_SEPOLIA_PRIVATE_KEY=${key}\n`);
  console.log("It is a testnet key with no value, but treat it as a secret anyway.");
  console.log("Fund the address before mining: https://portal.cdp.coinbase.com/products/faucet\n");
}

const address = privateKeyToAccount(
  (existing !== undefined && existing !== "" ? existing : generatePrivateKey()) as `0x${string}`,
).address;

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
});

const balance = await client.getBalance({ address });
console.log(`Balance on Base Sepolia: ${formatEther(balance)} ETH`);
if (balance === 0n) console.log("Fund it and the agent can start mining and listing.");
