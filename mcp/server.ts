import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatEther, keccak256, parseEther, type Address, type Hex } from "viem";
import { z } from "zod";

import { describeEffort, expandLoose, expectedAttempts } from "../shared/leet.js";
import {
  chainClients,
  commitHashFor,
  explorerUrl,
  marasAbi,
  marketAddress,
  onChainSpec,
  vaultInitCode,
} from "../shared/market.js";

interface NamedListing {
  seller: Address;
  price: bigint;
  salt: Hex;
  predicted: Address;
  sold: boolean;
}

const specShape = {
  minZeroBytes: z.number().int().min(0).max(20).default(0),
  pattern: z
    .string()
    .regex(/^[0-9a-fA-F]{1,8}$/)
    .optional()
    .describe("one to eight hex characters that must appear in the address, e.g. cafe"),
  loose: z
    .boolean()
    .default(true)
    .describe("also accept lookalikes, so cafe matches caf3, c4fe and c4f3"),
  hookMask: z
    .number()
    .int()
    .min(0)
    .max(0x3fff)
    .optional()
    .describe("Uniswap V4 permission bits the address must carry in its low 14 bits"),
};

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

function buildSpec(input: {
  minZeroBytes: number;
  pattern?: string;
  loose: boolean;
  hookMask?: number;
}) {
  const patterns = expandLoose(input.pattern ?? "", input.loose);
  return {
    spec: onChainSpec({ minZeroBytes: input.minZeroBytes, hookMask: input.hookMask, patterns }),
    patterns,
  };
}

function leadingZeroBytesOf(address: Address): number {
  const body = address.slice(2).toLowerCase();
  let count = 0;
  while (body.slice(count * 2, count * 2 + 2) === "00") count++;
  return count;
}

async function readListing(id: bigint): Promise<NamedListing> {
  const { publicClient } = chainClients();
  return (await publicClient.readContract({
    address: marketAddress(),
    abi: marasAbi,
    functionName: "getNamedListing",
    args: [id],
  })) as unknown as NamedListing;
}

const server = new McpServer({ name: "maras", version: "1.0.0" });

server.registerTool(
  "search_addresses",
  {
    title: "Search mined addresses",
    description:
      "Lists mined contract addresses for sale, filtered by leading zero bytes, a hex pattern, or price.",
    inputSchema: {
      minZeroBytes: z.number().int().min(0).max(20).default(0),
      contains: z.string().regex(/^[0-9a-fA-F]{1,8}$/).optional(),
      maxPriceEth: z.string().optional(),
    },
  },
  async ({ minZeroBytes, contains, maxPriceEth }) => {
    const { publicClient } = chainClients();
    const count = (await publicClient.readContract({
      address: marketAddress(),
      abi: marasAbi,
      functionName: "namedListingCount",
    })) as bigint;

    const ceiling = maxPriceEth === undefined ? undefined : parseEther(maxPriceEth);
    const needle = contains?.toLowerCase();
    const rows: string[] = [];

    for (let id = 0n; id < count; id++) {
      const listing = await readListing(id);
      if (listing.sold) continue;

      const zeros = leadingZeroBytesOf(listing.predicted);
      const body = listing.predicted.slice(2).toLowerCase();
      if (zeros < minZeroBytes) continue;
      if (needle !== undefined && !body.includes(needle)) continue;
      if (ceiling !== undefined && listing.price > ceiling) continue;

      rows.push(`#${id} ${listing.predicted} · ${zeros} zero bytes · ${formatEther(listing.price)} ETH`);
    }

    return text(rows.length === 0 ? "No listings match." : rows.join("\n"));
  },
);

server.registerTool(
  "buy_address",
  {
    title: "Buy a mined address",
    description:
      "Buys a listed address and deploys an OwnedVault there owned by `owner`. Payment and deployment happen in one transaction, so a failed purchase costs only gas.",
    inputSchema: {
      id: z.number().int().min(0),
      owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    },
  },
  async ({ id, owner }) => {
    const { publicClient, walletClient } = chainClients();
    const listing = await readListing(BigInt(id));
    if (listing.sold) return text(`Listing #${id} is already sold.`);

    const hash = await walletClient.writeContract({
      address: marketAddress(),
      abi: marasAbi,
      functionName: "buyNamed",
      args: [BigInt(id), vaultInitCode(owner as Address)],
      value: listing.price,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") return text(`Purchase reverted in block ${receipt.blockNumber}.`);

    return text(
      `Bought #${id} for ${formatEther(listing.price)} ETH.\n${listing.predicted}\n${explorerUrl(listing.predicted)}`,
    );
  },
);

server.registerTool(
  "post_request",
  {
    title: "Post a mining request",
    description:
      "Escrows a bounty for an address nobody has mined yet. The buyer's payload is bound by hash, so a miner cannot deploy their own contract at the qualifying address and collect the bounty.",
    inputSchema: {
      ...specShape,
      owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      bountyEth: z.string(),
    },
  },
  async ({ minZeroBytes, pattern, loose, hookMask, owner, bountyEth }) => {
    const { publicClient, walletClient } = chainClients();
    const { spec, patterns } = buildSpec({ minZeroBytes, pattern, loose, hookMask });
    const initCode = vaultInitCode(owner as Address);

    const attempts = expectedAttempts({
      minZeroBytes,
      hookMask,
      patternNibbles: patterns[0]?.length ? patterns[0].length - 2 : 0,
      variantCount: patterns.length,
    });

    const hash = await walletClient.writeContract({
      address: marketAddress(),
      abi: marasAbi,
      functionName: "postRequest",
      args: [spec, keccak256(initCode)],
      value: parseEther(bountyEth),
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const spellings = patterns.length > 1 ? ` Accepting ${patterns.length} spellings.` : "";
    return text(
      `Request posted with a ${bountyEth} ETH bounty. A miner should need ${describeEffort(attempts)} on one GPU.${spellings}\nBound payload hash ${keccak256(initCode)}`,
    );
  },
);

server.registerTool(
  "submit_salt",
  {
    title: "List a mined salt",
    description:
      "Registers an already-mined salt for sale. Commits first and reveals a block later, because a salt broadcast in one transaction could otherwise be copied and registered by someone else.",
    inputSchema: {
      ...specShape,
      salt: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      priceEth: z.string(),
    },
  },
  async ({ salt, priceEth, minZeroBytes, pattern, loose, hookMask }) => {
    const { account, publicClient, walletClient } = chainClients();
    const { spec } = buildSpec({ minZeroBytes, pattern, loose, hookMask });

    const commitHash = await walletClient.writeContract({
      address: marketAddress(),
      abi: marasAbi,
      functionName: "commitSalt",
      args: [commitHashFor(salt as Hex, account.address)],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: commitHash });

    while ((await publicClient.getBlockNumber()) <= receipt.blockNumber) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    const listHash = await walletClient.writeContract({
      address: marketAddress(),
      abi: marasAbi,
      functionName: "listNamed",
      args: [salt as Hex, parseEther(priceEth), spec],
    });
    const listReceipt = await publicClient.waitForTransactionReceipt({ hash: listHash });
    if (listReceipt.status !== "success") {
      return text(`Listing reverted in block ${listReceipt.blockNumber}. The claim did not hold.`);
    }

    return text(`Listed for ${priceEth} ETH.`);
  },
);

await server.connect(new StdioServerTransport());
