import { createPublicClient, getAddress, http, toHex, type Address } from "viem";
import { baseSepolia } from "viem/chains";

import { predictAddress } from "../shared/create3.js";
import { marasAbi } from "../shared/generated/abi.js";
import { marketAddress } from "../shared/market.js";

/**
 * The parity test covers a locally deployed instance. This checks the same invariant against
 * the real deployment, because a divergence here fails silently: every mined address would
 * simply be wrong, with nothing to indicate it.
 */
const market = marketAddress() as Address;
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"),
});

console.log(`Checking derivation parity against ${market}\n`);

let mismatches = 0;
for (const seed of [0, 1, 7, 42, 1234, 99999]) {
  const salt = toHex(seed, { size: 32 });
  const offChain = getAddress(predictAddress(market, salt));
  const onChain = getAddress(
    await client.readContract({
      address: market,
      abi: marasAbi,
      functionName: "predictAddress",
      args: [salt],
    }),
  );

  const agrees = offChain === onChain;
  if (!agrees) mismatches++;
  console.log(`salt ${String(seed).padEnd(6)} ${agrees ? "match" : "MISMATCH"}  ${onChain}`);
}

console.log(
  mismatches === 0
    ? "\nOff-chain miner agrees with the deployed contract."
    : `\n${mismatches} mismatches — the miner would produce unusable salts.`,
);
process.exit(mismatches === 0 ? 0 : 1);
