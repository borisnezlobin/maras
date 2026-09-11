import { declaredWords } from "@/lib/mcp/format";
import { GRINDER_FILES } from "@/lib/mcp/grinder.generated";
import { market, type OnChainSpecRecord } from "@/lib/mcp/reads";

export const DEFAULT_LIST_ABOVE = 28;

/** Sent to every client on connect, so an agent with no other context can work the market. */
export const SERVER_INSTRUCTIONS = `Maras is a marketplace for mined CREATE3 contract addresses on Base Sepolia (chain 84532), at ${market}. An address is a pure function of (this contract, salt), so a seller grinds salts until one produces a rare address, and a buyer later deploys their own code there. The contract re-derives every address itself, so a false claim about an address reverts.

This server holds no keys. Every prepare_ tool returns an unsigned transaction (to, value, data) that you sign and send from your own wallet.

There are three ways to trade:

1. Named pool. The seller reveals the salt and the address is public. Buyers inspect it and pay, and the deploy and payment happen in one transaction.
   Selling: prepare_commit_salt, wait until it lands and one more block passes, then prepare_list_named. There is no bond and you do not need to stay online.
   Buying: search_addresses, then prepare_buy.
   Use it for anything you have already mined. It is the default for mining byproducts.

2. Sealed pool. The seller publishes only a salt commitment, a claimed spec, and a bond. The buyer pays without seeing the address, which starts a 10-minute window for the seller to reveal with prepare_deliver_sealed.
   If the seller misses the window, the buyer calls prepare_timeout_sealed and takes back the price plus the seller's bond. The claim is only checked at delivery, so the bond is what backs it.
   Selling: prepare_list_sealed (one transaction, no separate commit), then poll check_sealed about every 30 seconds, because nothing notifies you of a sale.
   Buying: search_sealed, then prepare_buy_sealed.
   It suits a buyer who wants any address in a tier rather than one specific address, and a seller who will stay online.

3. Bounties. A buyer escrows ETH for a spec nobody has mined yet (prepare_request) and binds their contract by hash.
   Filling: search_requests to find open ones, mine a matching salt, prepare_commit_salt, wait a block, then prepare_fill_request. The buyer's code is deployed and the bounty is paid to you.

Every reveal (listNamed, fillRequest) must come at least one block after its commit, from the same address. The commit binds keccak256(abi.encode(salt, seller)), so nobody can copy a salt out of your pending reveal. You can pass commitHash instead of salt if you would rather not show this server the salt.

Mining: call get_miner for a multithreaded Rust grinder that checks addresses exactly as the contract does. It runs at about 14M addresses per second on a 10-core laptop, and estimate_mining tells you how many attempts a spec needs. While it grinds toward a target, it also reports any rare byproduct (leading zero bytes, many V4 hook permissions, an English word in hex, or a combination). List those in the named pool with prepare_list_named, passing the find's rarityBits so it is priced for you.`;

function hexOfMask(mask: number): string {
  return mask.toString(16);
}

/** Flags that make the grinder stop on exactly what the bounty's spec demands. */
export function targetFlags(spec: OnChainSpecRecord): string[] {
  const flags = ["--zeros", String(spec.minZeroBytes)];
  if (spec.checkHookMask) flags.push("--hook-mask", hexOfMask(spec.hookMask));
  for (const word of declaredWords(spec)) flags.push("--pattern", word);
  return flags;
}

export function grinderCommand(target: string[], listAbove: number): string {
  const flags = [...target, "--list-above", String(listAbove)];
  return `grinder/target/release/grinder --deployer ${market} ${flags.join(" ")}`;
}

const OUTPUT_GUIDE = `Every stdout line is one JSON object; progress goes to stderr.

  {"type":"target","salt":…,"address":…}
    The salt satisfies your target and the grinder stops. For a bounty: prepare_commit_salt, wait a block, prepare_fill_request.

  {"type":"find","salt":…,"address":…,"rarityBits":…,"minZeroBytes":…,"hookMask":…|null,"pattern":…|null,"word":…|null}
    A rare byproduct. List it: prepare_commit_salt, wait a block, then prepare_list_named with salt, minZeroBytes, hookMask (omit if null), pattern (omit if null), loose=false and rarityBits. Each field is a true claim about the address, and the contract verifies it.

Send transactions one at a time from one wallet so nonces stay in order. Never list a target salt as well: listing claims the salt, and the fill would then revert.`;

function fileBlock(file: { path: string; contents: string }): string {
  return `--- grinder/${file.path} ---\n${file.contents}`;
}

export function minerGuide(command: string, heading: string): string {
  const setup = `Write each file below under a grinder/ directory, then build it once with Rust installed:\n\n  cargo build --release --manifest-path grinder/Cargo.toml`;
  return [heading, setup, `Run:\n\n  ${command}`, OUTPUT_GUIDE, ...GRINDER_FILES.map(fileBlock)].join(
    "\n\n",
  );
}
