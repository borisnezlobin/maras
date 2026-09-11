import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { encodeFunctionData, formatEther, keccak256, parseEther, type Address, type Hex } from "viem";
import { z } from "zod";

import { leadingZeroBytes } from "@/lib/address";
import { commitHashFor } from "@/lib/commit";
import { describeCost, describeEffort, expandLoose, expectedAttempts } from "@/lib/leet";
import { marasAbi } from "@/lib/maras.generated";
import {
  buildSpec,
  describeNamed,
  describeRequest,
  describeSealed,
  describeSpec,
  sealedIsOpen,
  secondsLeft,
  text,
  unsignedTransaction,
  type BuiltSpec,
} from "@/lib/mcp/format";
import {
  readAllNamed,
  readAllRequests,
  readAllSealed,
  readNamed,
  readRequest,
  readSealed,
  type NamedListing,
  type OnChainSpecRecord,
} from "@/lib/mcp/reads";
import { vaultInitCode, vaultInitCodeHash } from "@/lib/payload";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ADDRESS = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const SALT = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const PATTERN = z.string().regex(/^[0-9a-fA-F]{1,8}$/);

const SPEC_FIELDS = {
  minZeroBytes: z.number().int().min(0).max(20).default(0),
  pattern: PATTERN.optional(),
  loose: z.boolean().default(true),
  hookMask: z.number().int().min(0).max(0x3fff).optional(),
};

function call(functionName: string, args: readonly unknown[]): Hex {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the ABI is a const tuple; the
  // tool schemas above are what actually validate each argument list.
  return encodeFunctionData({ abi: marasAbi, functionName, args } as any);
}

function effortOf(spec: BuiltSpec): number {
  return expectedAttempts({
    minZeroBytes: spec.minZeroBytes,
    hookMask: spec.checkHookMask ? spec.hookMask : undefined,
    patternNibbles: spec.patternNibbles,
    variantCount: spec.patternCount,
  });
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

/**
 * A buyer binds their creation code by hash before the seller reveals anything, so delivery has
 * to reproduce that exact code. Rebuilding it from their address covers everyone who bought
 * through this server or the site; anything else has to be supplied by the caller.
 */
function payloadFor(buyer: Address, boundHash: Hex, supplied: string | undefined): Hex {
  if (supplied !== undefined) {
    if (keccak256(supplied as Hex) !== boundHash) {
      throw new Error(`the initCode you passed hashes to something other than ${boundHash}`);
    }
    return supplied as Hex;
  }

  const rebuilt = vaultInitCode(buyer);
  if (keccak256(rebuilt) !== boundHash) {
    throw new Error(
      `the buyer bound a payload this server cannot rebuild (${boundHash}); pass their exact initCode`,
    );
  }
  return rebuilt;
}

/** Either the caller hashed the salt itself, or it trusts this server with the salt to do it. */
function commitmentFrom(salt: string | undefined, commitHash: string | undefined, seller: string): Hex {
  if (commitHash !== undefined) return commitHash as Hex;
  if (salt === undefined) throw new Error("pass either salt or commitHash");
  return commitHashFor(salt as Hex, seller as Address);
}

function registerSearches(server: McpServer): void {
  server.registerTool(
    "search_addresses",
    {
      title: "Search mined contract addresses",
      description:
        "Lists addresses for sale, filtered by leading zero bytes, a hex pattern, or price. These are named listings: you can see exactly what you are buying.",
      inputSchema: {
        minZeroBytes: z.number().int().min(0).max(20).default(0),
        contains: PATTERN.optional(),
        maxPriceEth: z.string().optional(),
      },
    },
    async ({ minZeroBytes, contains, maxPriceEth }) => {
      const filters = {
        minZeroBytes,
        needle: contains?.toLowerCase(),
        ceiling: maxPriceEth === undefined ? undefined : parseEther(maxPriceEth),
      };

      const rows = (await readAllNamed())
        .filter((entry) => matchesFilters(entry.record, filters))
        .map((entry) => describeNamed(entry.id, entry.record));

      return text(rows.length === 0 ? "Nothing for sale matches." : rows.join("\n"));
    },
  );

  server.registerTool(
    "search_sealed",
    {
      title: "Search sealed listings",
      description:
        "Lists addresses offered without being shown. You pay first and the seller reveals afterwards, backed by a bond you collect if they miss the window.",
      inputSchema: { openOnly: z.boolean().default(true) },
    },
    async ({ openOnly }) => {
      const rows = (await readAllSealed())
        .filter((entry) => !entry.record.settled)
        .filter((entry) => !openOnly || sealedIsOpen(entry.record))
        .map((entry) => describeSealed(entry.id, entry.record));

      return text(rows.length === 0 ? "No sealed listings on offer." : rows.join("\n"));
    },
  );

  server.registerTool(
    "search_requests",
    {
      title: "Search open bounties",
      description:
        "Lists bounties buyers have escrowed for addresses nobody has mined yet. Mine one and fill it to collect.",
      inputSchema: { openOnly: z.boolean().default(true) },
    },
    async ({ openOnly }) => {
      const rows = (await readAllRequests())
        .filter((entry) => !openOnly || !entry.record.filled)
        .map((entry) => describeRequest(entry.id, entry.record));

      return text(rows.length === 0 ? "No open bounties." : rows.join("\n"));
    },
  );

  server.registerTool(
    "check_sealed",
    {
      title: "Check a sealed listing",
      description:
        "Reports whether a sealed listing has been bought and how long is left to deliver. A seller agent should poll this after listing, since nothing can wake it when a buyer arrives.",
      inputSchema: { id: z.number().int().min(0) },
    },
    async ({ id }) => {
      const listing = await readSealed(BigInt(id));
      if (listing.settled) return text(`Sealed #${id} is settled. Nothing left to do.`);
      if (sealedIsOpen(listing)) {
        return text(
          `Sealed #${id} is still unsold, promising ${describeSpec(listing.spec)} for ${formatEther(listing.price)} ETH. Keep polling.`,
        );
      }

      const left = secondsLeft(listing.deadline);
      if (left <= 0) {
        return text(
          `Sealed #${id} was bought by ${listing.buyer} and the window closed ${-left}s ago. They can reclaim the price and your bond.`,
        );
      }

      return text(
        `Sealed #${id} was bought by ${listing.buyer}. You have ${left}s to call prepare_deliver_sealed and send the transaction, or you lose the ${formatEther(listing.bond)} ETH bond.`,
      );
    },
  );
}

function registerBuying(server: McpServer): void {
  server.registerTool(
    "prepare_buy",
    {
      title: "Prepare a purchase",
      description:
        "Builds the transaction that buys a listed address and deploys a vault you own at it. Sign and send it yourself; this server holds no keys.",
      inputSchema: { id: z.number().int().min(0), owner: ADDRESS },
    },
    async ({ id, owner }) => {
      const listing = await readNamed(BigInt(id));
      if (listing.sold) return text(`Listing #${id} is already sold.`);

      return unsignedTransaction(
        call("buyNamed", [BigInt(id), vaultInitCode(owner as Address)]),
        listing.price,
        `Buying ${listing.predicted} for ${formatEther(listing.price)} ETH. Payment and deployment happen together, so a failed purchase costs only gas.`,
      );
    },
  );

  server.registerTool(
    "prepare_buy_sealed",
    {
      title: "Prepare a sealed purchase",
      description:
        "Builds the transaction that buys a sealed listing sight unseen. The seller then has ten minutes to reveal; if they do not, call prepare_timeout_sealed to take back your payment and their bond.",
      inputSchema: { id: z.number().int().min(0), owner: ADDRESS },
    },
    async ({ id, owner }) => {
      const listing = await readSealed(BigInt(id));
      if (!sealedIsOpen(listing)) return text(`Sealed #${id} is not available.`);

      return unsignedTransaction(
        call("buySealed", [BigInt(id), vaultInitCodeHash(owner as Address)]),
        listing.price,
        `Buying an unseen address promising ${describeSpec(listing.spec)} for ${formatEther(listing.price)} ETH, against a ${formatEther(listing.bond)} ETH bond. You will not see the address until the seller reveals it.`,
      );
    },
  );

  server.registerTool(
    "prepare_timeout_sealed",
    {
      title: "Reclaim a sealed purchase",
      description:
        "Builds the transaction that refunds you and slashes the seller's bond after they miss the delivery window. Only the buyer can call it, and only once the window has closed.",
      inputSchema: { id: z.number().int().min(0) },
    },
    async ({ id }) => {
      const listing = await readSealed(BigInt(id));
      if (listing.settled) return text(`Sealed #${id} is already settled.`);

      const left = secondsLeft(listing.deadline);
      if (left > 0) return text(`Too early: the seller still has ${left}s to deliver.`);

      return unsignedTransaction(
        call("timeoutSealed", [BigInt(id)]),
        0n,
        `Reclaiming ${formatEther(listing.price + listing.bond)} ETH: your payment plus the seller's forfeited bond.`,
      );
    },
  );

  server.registerTool(
    "prepare_request",
    {
      title: "Post a bounty",
      description:
        "Builds the transaction that escrows a bounty for an address nobody has mined yet, and estimates what the grind will cost a miner. Your payload is bound by hash, so nobody can deploy their own contract at the qualifying address.",
      inputSchema: { ...SPEC_FIELDS, owner: ADDRESS, bountyEth: z.string() },
    },
    async ({ minZeroBytes, pattern, loose, hookMask, owner, bountyEth }) => {
      const spec = buildSpec({ minZeroBytes, pattern, loose, hookMask });
      const attempts = effortOf(spec);

      return unsignedTransaction(
        call("postRequest", [spec, vaultInitCodeHash(owner as Address)]),
        parseEther(bountyEth),
        `A miner should need ${describeEffort(attempts)} on a GPU, ${describeCost(attempts)} of rented time, so a bounty under that will not be taken. Your payload is bound by hash (${vaultInitCodeHash(owner as Address)}).`,
      );
    },
  );
}

function registerSelling(server: McpServer): void {
  server.registerTool(
    "prepare_commit_salt",
    {
      title: "Commit a mined salt",
      description:
        "First of two steps for listing a named address or filling a bounty: it binds the salt to your address so nobody can copy it out of your reveal. The second step must go in a LATER block. Pass commitHash instead of salt if you would rather not show this server the salt.",
      inputSchema: { salt: SALT.optional(), commitHash: SALT.optional(), seller: ADDRESS },
    },
    async ({ salt, commitHash, seller }) =>
      unsignedTransaction(
        call("commitSalt", [commitmentFrom(salt, commitHash, seller)]),
        0n,
        "Send this, wait for it to land, then send the listing or fill from the same address in a later block. The commitment is consumed once used.",
      ),
  );

  server.registerTool(
    "prepare_list_named",
    {
      title: "List a mined address for sale",
      description:
        "Second step after prepare_commit_salt, and it must land in a later block than the commit. The contract re-derives the address from your salt and rejects the listing if it does not match what you claim.",
      inputSchema: { ...SPEC_FIELDS, salt: SALT, priceEth: z.string() },
    },
    async ({ minZeroBytes, pattern, loose, hookMask, salt, priceEth }) => {
      const spec = buildSpec({ minZeroBytes, pattern, loose, hookMask });

      return unsignedTransaction(
        call("listNamed", [salt as Hex, parseEther(priceEth), spec]),
        0n,
        `Listing an address claiming ${describeSpec(spec as unknown as OnChainSpecRecord)} at ${priceEth} ETH. A false claim reverts, and you must have committed this salt in an earlier block.`,
      );
    },
  );

  server.registerTool(
    "prepare_list_sealed",
    {
      title: "Offer an address without showing it",
      description:
        "Publishes only a commitment plus a bond, so the buyer cannot inspect the address before paying. One transaction, no separate commit. Once someone buys you have ten minutes to deliver or forfeit the bond, so poll check_sealed after listing.",
      inputSchema: {
        ...SPEC_FIELDS,
        salt: SALT.optional(),
        commitHash: SALT.optional(),
        seller: ADDRESS,
        priceEth: z.string(),
        bondEth: z.string(),
      },
    },
    async ({ minZeroBytes, pattern, loose, hookMask, salt, commitHash, seller, priceEth, bondEth }) => {
      const spec = buildSpec({ minZeroBytes, pattern, loose, hookMask });

      return unsignedTransaction(
        call("listSealed", [commitmentFrom(salt, commitHash, seller), parseEther(priceEth), spec]),
        parseEther(bondEth),
        `Offering an unseen address promising ${describeSpec(spec as unknown as OnChainSpecRecord)} at ${priceEth} ETH, staking ${bondEth} ETH. Keep the salt: you cannot deliver without it.`,
      );
    },
  );

  server.registerTool(
    "prepare_deliver_sealed",
    {
      title: "Deliver a sealed address",
      description:
        "Reveals the salt and deploys the buyer's payload at the mined address, releasing the price and returning your bond. Must land inside the ten-minute window that started when they paid.",
      inputSchema: { id: z.number().int().min(0), salt: SALT, initCode: z.string().optional() },
    },
    async ({ id, salt, initCode }) => {
      const listing = await readSealed(BigInt(id));
      if (listing.settled) return text(`Sealed #${id} is already settled.`);
      if (sealedIsOpen(listing)) return text(`Sealed #${id} has no buyer yet.`);

      const left = secondsLeft(listing.deadline);
      if (left <= 0) return text(`The window closed ${-left}s ago; the buyer can now reclaim.`);

      const payload = payloadFor(listing.buyer, listing.initCodeHash, initCode);

      return unsignedTransaction(
        call("deliverSealed", [BigInt(id), salt as Hex, payload]),
        0n,
        `Delivering to ${listing.buyer} with ${left}s to spare. You receive ${formatEther(listing.price + listing.bond)} ETH: the price plus your bond back.`,
      );
    },
  );

  server.registerTool(
    "prepare_fill_request",
    {
      title: "Fill a bounty",
      description:
        "Claims an open bounty with a salt you mined for it. Requires prepare_commit_salt in an earlier block. The buyer's code is bound by hash, so you deploy theirs rather than your own.",
      inputSchema: { id: z.number().int().min(0), salt: SALT, initCode: z.string().optional() },
    },
    async ({ id, salt, initCode }) => {
      const request = await readRequest(BigInt(id));
      if (request.filled) return text(`Bounty #${id} is already filled.`);

      const payload = payloadFor(request.buyer, request.initCodeHash, initCode);

      return unsignedTransaction(
        call("fillRequest", [BigInt(id), salt as Hex, payload]),
        0n,
        `Filling bounty #${id} for ${formatEther(request.bounty)} ETH. It wants ${describeSpec(request.spec)}, and the contract checks that before paying.`,
      );
    },
  );

  server.registerTool(
    "estimate_mining",
    {
      title: "Estimate a grind",
      description:
        "Says how long an address matching these constraints should take on one GPU and what that costs to rent. Use it to price a listing or size a bounty before committing money.",
      inputSchema: SPEC_FIELDS,
    },
    async ({ minZeroBytes, pattern, loose, hookMask }) => {
      const spellings = expandLoose(pattern ?? "", loose);
      const attempts = effortOf(buildSpec({ minZeroBytes, pattern, loose, hookMask }));
      const spellingNote =
        spellings.length > 1 ? ` Accepting ${spellings.length} spellings shortens it.` : "";

      return text(
        `About ${Math.round(attempts).toLocaleString()} attempts: ${describeEffort(attempts)} on one GPU, ${describeCost(attempts)} of rented time.${spellingNote}`,
      );
    },
  );
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "maras", version: "1.0.0" });
  registerSearches(server);
  registerBuying(server);
  registerSelling(server);
  return server;
}

async function handle(request: Request): Promise<Response> {
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
