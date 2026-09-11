import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  keccak256,
  parseEther,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import { z } from "zod";

import { leadingZeroBytes, hookPermissions } from "@/lib/address";
import { describeCost, describeEffort, expandLoose, expectedAttempts, padPatterns } from "@/lib/leet";
import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";
import { vaultInitCode, vaultInitCodeHash } from "@/lib/payload";
import { baseSepoliaTransport } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const market = MARAS_ADDRESS as Address;

const client = createPublicClient({
  chain: baseSepolia,
  transport: baseSepoliaTransport(),
  batch: { multicall: true },
});

interface OnChainSpecRecord {
  minZeroBytes: number;
  hookMask: number;
  checkHookMask: boolean;
  patterns: readonly string[];
  patternCount: number;
  patternNibbles: number;
}

interface NamedListing {
  seller: Address;
  price: bigint;
  predicted: Address;
  sold: boolean;
  spec: OnChainSpecRecord;
}

/** The words the seller declared, which the contract verified before accepting the listing. */
function declaredWords(spec: OnChainSpecRecord): string[] {
  return spec.patterns
    .slice(0, spec.patternCount)
    .map((pattern) => pattern.replace(/^0x/, "").slice(-spec.patternNibbles));
}

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

/**
 * This server never sees a private key. Anything that costs money comes back as an unsigned
 * transaction for the caller to sign with a wallet it controls.
 */
function unsignedTransaction(data: string, value: bigint, note: string) {
  return text(
    `${note}\n\nSend this transaction from your own wallet on Base Sepolia (chain 84532):\n\n` +
      `  to     ${market}\n  value  ${value} wei (${formatEther(value)} ETH)\n  data   ${data}`,
  );
}

interface ListingFilters {
  minZeroBytes: number;
  needle?: string;
  ceiling?: bigint;
}

function matchesFilters(listing: NamedListing, filters: ListingFilters): boolean {
  if (listing.sold) return false;
  if (leadingZeroBytes(listing.predicted) < filters.minZeroBytes) return false;
  if (filters.ceiling !== undefined && listing.price > filters.ceiling) return false;
  if (filters.needle === undefined) return true;
  return listing.predicted.slice(2).toLowerCase().includes(filters.needle);
}

function describeListing(id: bigint, listing: NamedListing): string {
  const zeros = leadingZeroBytes(listing.predicted);
  const permissions = hookPermissions(listing.predicted).length;
  const words = declaredWords(listing.spec);
  const minedFor = words.length === 0 ? "" : ` · contains ${words[0]}`;

  return `#${id} ${listing.predicted} · ${zeros} zero bytes${minedFor} · ${permissions} V4 permissions · ${formatEther(listing.price)} ETH`;
}

async function readListing(id: bigint): Promise<NamedListing> {
  return (await client.readContract({
    address: market,
    abi: marasAbi,
    functionName: "getNamedListing",
    args: [id],
  })) as unknown as NamedListing;
}

interface IdentifiedListing {
  id: bigint;
  listing: NamedListing;
}

/**
 * One aggregated call rather than one per listing. Awaiting each id in turn issued sixty-odd
 * separate requests per search, which the public endpoint answered with a rate limit.
 */
async function readAllListings(count: bigint): Promise<IdentifiedListing[]> {
  const ids = Array.from({ length: Number(count) }, (_, index) => BigInt(index));
  const results = await client.multicall({
    contracts: ids.map((id) => ({
      address: market,
      abi: marasAbi,
      functionName: "getNamedListing" as const,
      args: [id] as const,
    })),
  });

  const found: IdentifiedListing[] = [];
  results.forEach((entry, index) => {
    if (entry.status !== "success") return;
    found.push({ id: ids[index], listing: entry.result as unknown as NamedListing });
  });

  return found;
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "maras", version: "1.0.0" });

  server.registerTool(
    "search_addresses",
    {
      title: "Search mined contract addresses",
      description:
        "Lists contract addresses for sale on Maras, filtered by leading zero bytes, a hex pattern, or price.",
      inputSchema: {
        minZeroBytes: z.number().int().min(0).max(20).default(0),
        contains: z.string().regex(/^[0-9a-fA-F]{1,8}$/).optional(),
        maxPriceEth: z.string().optional(),
      },
    },
    async ({ minZeroBytes, contains, maxPriceEth }) => {
      const count = (await client.readContract({
        address: market,
        abi: marasAbi,
        functionName: "namedListingCount",
      })) as bigint;

      const filters = {
        minZeroBytes,
        needle: contains?.toLowerCase(),
        ceiling: maxPriceEth === undefined ? undefined : parseEther(maxPriceEth),
      };

      const rows = (await readAllListings(count))
        .filter((entry) => matchesFilters(entry.listing, filters))
        .map((entry) => describeListing(entry.id, entry.listing));

      return text(rows.length === 0 ? "Nothing for sale matches." : rows.join("\n"));
    },
  );

  server.registerTool(
    "prepare_buy",
    {
      title: "Prepare a purchase",
      description:
        "Returns the unsigned transaction that buys a listed address and deploys a vault you own at it. Sign and send it yourself; this server holds no keys.",
      inputSchema: {
        id: z.number().int().min(0),
        owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      },
    },
    async ({ id, owner }) => {
      const listing = await readListing(BigInt(id));
      if (listing.sold) return text(`Listing #${id} is already sold.`);

      const data = encodeFunctionData({
        abi: marasAbi,
        functionName: "buyNamed",
        args: [BigInt(id), vaultInitCode(owner as Address)],
      });

      return unsignedTransaction(
        data,
        listing.price,
        `Buying ${listing.predicted} for ${formatEther(listing.price)} ETH. Payment and deployment happen together, so a failed purchase costs only gas.`,
      );
    },
  );

  server.registerTool(
    "prepare_request",
    {
      title: "Prepare a mining request",
      description:
        "Returns the unsigned transaction that escrows a bounty for an address nobody has mined yet, and estimates what the grind will cost a miner.",
      inputSchema: {
        minZeroBytes: z.number().int().min(0).max(20).default(0),
        pattern: z.string().regex(/^[0-9a-fA-F]{1,8}$/).optional(),
        loose: z.boolean().default(true),
        owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        bountyEth: z.string(),
      },
    },
    async ({ minZeroBytes, pattern, loose, owner, bountyEth }) => {
      const spellings = expandLoose(pattern ?? "", loose);
      const attempts = expectedAttempts({
        minZeroBytes,
        patternNibbles: spellings[0]?.length ?? 0,
        variantCount: spellings.length,
      });

      const data = encodeFunctionData({
        abi: marasAbi,
        functionName: "postRequest",
        args: [
          {
            minZeroBytes,
            hookMask: 0,
            checkHookMask: false,
            patterns: padPatterns(spellings),
            patternCount: spellings.length,
            patternNibbles: spellings[0]?.length ?? 0,
          },
          vaultInitCodeHash(owner as Address),
        ],
      });

      return unsignedTransaction(
        data,
        parseEther(bountyEth),
        `A miner should need ${describeEffort(attempts)} on a GPU, ${describeCost(attempts)} of rented time, so a bounty under that will not be taken. Your payload is bound by hash (${keccak256(vaultInitCode(owner as Address))}), so nobody can deploy their own contract at the qualifying address.`,
      );
    },
  );

  return server;
}

async function handle(request: Request): Promise<Response> {
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
