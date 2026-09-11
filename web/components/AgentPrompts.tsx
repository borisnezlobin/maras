"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";

import { Card, IconButton } from "@/components/ui";
import { MARAS_ADDRESS } from "@/lib/maras.generated";

const REPO = "https://github.com/borisnezlobin/maras";

interface Job {
  label: string;
  body: string;
}

function setup(market: string): string {
  return `Clone ${REPO} and run pnpm install. Maras is a marketplace for mined contract addresses at ${market} on Base Sepolia.`;
}

function jobs(market: string): Job[] {
  const base = setup(market);

  return [
    {
      label: "Mine addresses and sell them",
      body: `${base}

Put my compute to work mining addresses and listing them for sale.

First ask me what to go after, and explain the trade-off so I can choose:
- leading zero bytes, which cut calldata gas on every future call
- a word spelled in hex, like cafe or deadbeef, optionally accepting lookalike spellings
- Uniswap V4 hook permission bits, which a hook contract needs in its own address

Then run, adjusting the settings to whatever I picked:

  MINE_ZERO_BYTES=3 MINE_PATTERN=cafe MINE_LOOSE=1 MINE_HOOK_MASK=9216 MINE_PRICE_ETH=0.002 npx hardhat run scripts/mine-and-list.ts --network baseSepolia

Every setting is optional. Each run prints the expected attempts before it starts, so raise the difficulty while runs stay quick and back off when one drags. Keep going and report each address you list with its Basescan link.

You need a funded Base Sepolia key. Either set mine with npx hardhat keystore set BASE_SEPOLIA_PRIVATE_KEY, or run npx tsx scripts/new-wallet.ts to make your own and ask me to fund it.`,
    },
    {
      label: "Fill an open request and collect the bounty",
      body: `${base}

Buyers escrow bounties for addresses nobody has mined yet. Find one and earn it:

  npx hardhat run scripts/fill-request.ts --network baseSepolia

It takes the first unfilled request, reads what it asks for, prints the expected mining time, then mines, commits, waits a block and fills it. Set REQUEST_ID=n to target a specific one.

The buyer's contract is bound by hash when they post, so you deploy their code rather than your own and cannot substitute anything. If the script says it cannot reconstruct the payload, skip that request and try the next.`,
    },
    {
      label: "Buy me an address",
      body: `Use the Maras MCP server at https://marasmarket.vercel.app/api/mcp (Base Sepolia, ${market}).

Call search_addresses to see what is for sale, then pick the best value for me. More leading zero bytes is rarer and saves gas on every future call, so weigh that against the price. Call prepare_buy with that listing id and owner set to my wallet address, then sign and send the transaction it hands back.

Payment and deployment happen in one transaction, so a failed purchase costs only gas. Tell me what you bought, what it cost, and the Basescan link.`,
    },
    {
      label: "Post a bounty for an address nobody has mined",
      body: `Use the Maras MCP server at https://marasmarket.vercel.app/api/mcp (Base Sepolia, ${market}).

Ask me what the address should look like, then call prepare_request with those settings, owner set to my wallet address, and a bounty you think is enough to interest a miner. It returns an unsigned transaction and tells you what the grind will cost in rented GPU time; sign and send it.

Turn loose matching on if the pattern has letters with lookalikes, since accepting caf3 alongside cafe shortens the grind and makes a miner more likely to take the job. My contract is bound by hash, so nobody can deploy their own at the qualifying address and collect.`,
    },
    {
      label: "Buy an address without being shown it first",
      body: `Use the Maras MCP server at https://marasmarket.vercel.app/api/mcp (Base Sepolia, ${market}).

Call search_sealed to see what is on offer. Each one promises a shape — so many leading zero bytes, maybe a word — without showing the address, and the seller stakes a bond against revealing it.

Weigh the bond against the price: a seller risking less than they charge has little reason to follow through. When one looks worth it, call prepare_buy_sealed with that id and owner set to my wallet address, then sign and send.

They then have ten minutes. Poll check_sealed until it says the address was delivered, and tell me what I got. If the window closes without delivery, call prepare_timeout_sealed and send it — that returns my payment and pays me their bond.`,
    },
    {
      label: "Sell an address nobody can see",
      body: `${base}

Sealed selling needs a salt, and finding one needs your GPU, so this runs from the repo rather than the MCP server.

  SEALED_ZERO_BYTES=2 SEALED_PRICE_ETH=0.002 SEALED_BOND_ETH=0.002 npx hardhat run scripts/list-sealed.ts --network baseSepolia

That mines an address, publishes only a commitment to it, and stakes the bond. Nothing about the address reaches the chain, so a buyer pays before seeing it. Print the listing id it gives you.

Then start the watcher and leave it running, because a buyer starts a ten-minute clock and nothing will wake you when they do:

  SEALED_ID=<the id> npx hardhat run scripts/deliver-sealed.ts --network baseSepolia

It waits for a buyer, rebuilds the payload they bound by hash, and deploys it at the mined address. Deliver and you collect the price and your bond back; miss the window and the buyer takes both. Tell me which address you sold and for how much.`,
    },
  ];
}

function mcpPrompt(): string {
  return `Install the Maras MCP server so you can trade contract addresses for me.

Add a remote MCP server named "maras" pointing at https://marasmarket.vercel.app/api/mcp — nothing to clone or install.

To look around it gives you search_addresses, search_sealed, search_requests, check_sealed and estimate_mining. To spend money it gives you prepare_buy, prepare_buy_sealed, prepare_timeout_sealed and prepare_request. To sell, prepare_commit_salt, prepare_list_named, prepare_list_sealed, prepare_deliver_sealed and prepare_fill_request.

Every prepare_ tool hands back an unsigned transaction on Base Sepolia for you to sign with a wallet you control. The server never holds a key, including yours.

Once it is connected, call search_addresses and tell me what is for sale.`;
}

function CopyControl({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_600);
  }

  return (
    <IconButton label={label} onClick={copy}>
      {copied ? <Check size={16} className="text-accent" /> : <Copy size={16} />}
    </IconButton>
  );
}

export function AgentPrompts() {
  if (MARAS_ADDRESS === null) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-text">Send an agent</h2>

      <Card className="flex items-center justify-between gap-4 p-4">
        <span className="text-sm text-text">
          Install the Maras MCP so your agent can use Maras — hosted, nothing to clone
        </span>
        <CopyControl text={mcpPrompt()} label="Copy the prompt that installs the MCP server" />
      </Card>

      <Card className="p-0">
        {jobs(MARAS_ADDRESS).map((job, index) => (
          <div
            key={job.label}
            className={`flex items-center justify-between gap-4 px-4 py-3 ${
              index === 0 ? "" : "border-t border-edge"
            }`}
          >
            <span className="text-sm text-text">{job.label}</span>
            <CopyControl text={job.body} label={`Copy prompt: ${job.label}`} />
          </div>
        ))}
      </Card>
    </section>
  );
}
