import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatEther, keccak256, parseEther, type Address, type Hex } from "viem";
import { z } from "zod";

import {
  chainClients,
  commitHashFor,
  explorerUrl,
  marasAbi,
  marketAddress,
  onChainSpec,
  vaultInitCode,
  type OnChainSpec,
} from "../shared/market.js";

type NamedListingTuple = [Address, bigint, Hex, Address, boolean];

const specShape = {
  minZeroBytes: z.number().int().min(0).max(20).default(0),
  hookMask: z.number().int().min(0).max(0x3fff).optional(),
  pattern: z
    .string()
    .regex(/^0x[0-9a-fA-F]{8}$/)
    .optional()
    .describe("four bytes that must appear byte-aligned in the address, e.g. 0xdeadbeef"),
};

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

async function readNamedListings() {
  const market = marketAddress();
  const { publicClient } = chainClients();

  const count = (await publicClient.readContract({
    address: market,
    abi: marasAbi,
    functionName: "namedListingCount",
  })) as bigint;

  const listings = [];
  for (let id = 0n; id < count; id++) {
    const [seller, price, , predicted, sold] = (await publicClient.readContract({
      address: market,
      abi: marasAbi,
      functionName: "namedListings",
      args: [id],
    })) as unknown as NamedListingTuple;

    listings.push({ id, seller, price, predicted, sold });
  }
  return listings;
}

function leadingZeroBytesOf(address: Address): number {
  const body = address.slice(2).toLowerCase();
  let count = 0;
  while (body.slice(count * 2, count * 2 + 2) === "00") count++;
  return count;
}

const server = new McpServer({ name: "maras", version: "1.0.0" });

server.registerTool(
  "search_addresses",
  {
    title: "Search mined addresses",
    description:
      "Lists unsold mined contract addresses for sale, optionally filtered by leading zero bytes or maximum price.",
    inputSchema: {
      minZeroBytes: z.number().int().min(0).max(20).default(0),
      maxPriceEth: z.string().optional(),
    },
  },
  async ({ minZeroBytes, maxPriceEth }) => {
    const ceiling = maxPriceEth === undefined ? undefined : parseEther(maxPriceEth);
    const matches = (await readNamedListings()).filter(
      (listing) =>
        !listing.sold &&
        leadingZeroBytesOf(listing.predicted) >= minZeroBytes &&
        (ceiling === undefined || listing.price <= ceiling),
    );

    if (matches.length === 0) return text("No listings match.");

    return text(
      matches
        .map(
          (listing) =>
            `#${listing.id} ${listing.predicted} · ${leadingZeroBytesOf(listing.predicted)} zero bytes · ${formatEther(listing.price)} ETH`,
        )
        .join("\n"),
    );
  },
);

server.registerTool(
  "buy_address",
  {
    title: "Buy a mined address",
    description:
      "Buys a listed address and deploys an OwnedVault there, owned by `owner`. Payment and deployment happen in one transaction.",
    inputSchema: {
      id: z.number().int().min(0),
      owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    },
  },
  async ({ id, owner }) => {
    const market = marketAddress();
    const { publicClient, walletClient } = chainClients();

    const [, price, , predicted, sold] = (await publicClient.readContract({
      address: market,
      abi: marasAbi,
      functionName: "namedListings",
      args: [BigInt(id)],
    })) as unknown as NamedListingTuple;

    if (sold) return text(`Listing #${id} is already sold.`);

    const hash = await walletClient.writeContract({
      address: market,
      abi: marasAbi,
      functionName: "buyNamed",
      args: [BigInt(id), vaultInitCode(owner as Address)],
      value: price,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return text(
      `Bought #${id} for ${formatEther(price)} ETH.\nDeployed at ${predicted}\n${explorerUrl(predicted)}`,
    );
  },
);

server.registerTool(
  "post_request",
  {
    title: "Post a mining request",
    description:
      "Escrows a bounty for an address nobody has mined yet. The buyer's payload is bound by hash, so a miner cannot substitute their own contract and collect the bounty.",
    inputSchema: {
      ...specShape,
      owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      bountyEth: z.string(),
    },
  },
  async ({ minZeroBytes, hookMask, pattern, owner, bountyEth }) => {
    const market = marketAddress();
    const { publicClient, walletClient } = chainClients();

    const initCode = vaultInitCode(owner as Address);
    const spec: OnChainSpec = onChainSpec({
      minZeroBytes,
      hookMask,
      pattern: pattern as Hex | undefined,
    });

    const hash = await walletClient.writeContract({
      address: market,
      abi: marasAbi,
      functionName: "postRequest",
      args: [spec, keccak256(initCode)],
      value: parseEther(bountyEth),
    });
    await publicClient.waitForTransactionReceipt({ hash });

    return text(
      `Request posted with a ${bountyEth} ETH bounty.\nBound payload hash ${keccak256(initCode)}`,
    );
  },
);

server.registerTool(
  "submit_salt",
  {
    title: "List a mined salt",
    description:
      "Registers an already-mined salt for sale. Sends the seller-bound commitment first, waits one block, then reveals — without that gap the salt could be copied from the pending transaction.",
    inputSchema: {
      ...specShape,
      salt: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      priceEth: z.string(),
    },
  },
  async ({ salt, priceEth, minZeroBytes, hookMask, pattern }) => {
    const market = marketAddress();
    const { account, publicClient, walletClient } = chainClients();

    const commitHash = await walletClient.writeContract({
      address: market,
      abi: marasAbi,
      functionName: "commitSalt",
      args: [commitHashFor(salt as Hex, account.address)],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: commitHash });

    while ((await publicClient.getBlockNumber()) <= receipt.blockNumber) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    const listHash = await walletClient.writeContract({
      address: market,
      abi: marasAbi,
      functionName: "listNamed",
      args: [
        salt as Hex,
        parseEther(priceEth),
        onChainSpec({ minZeroBytes, hookMask, pattern: pattern as Hex | undefined }),
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash: listHash });

    return text(`Listed for ${priceEth} ETH.`);
  },
);

await server.connect(new StdioServerTransport());
