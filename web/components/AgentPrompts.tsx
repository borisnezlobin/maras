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
      body: `Use the Maras MCP server on Base Sepolia (${market}).

Call search_addresses to see what is for sale, then pick the best value for me. More leading zero bytes is rarer and saves gas on every future call, so weigh that against the price. Buy it with buy_address, owner set to my wallet address.

Payment and deployment happen in one transaction, so a failed purchase costs only gas. Tell me what you bought, what it cost, and the Basescan link.`,
    },
    {
      label: "Post a bounty for an address nobody has mined",
      body: `Use the Maras MCP server on Base Sepolia (${market}).

Ask me what the address should look like, then call post_request with those settings, owner set to my wallet address, and a bounty you think is enough to interest a miner.

Turn loose matching on if the pattern has letters with lookalikes, since accepting caf3 alongside cafe shortens the grind and makes a miner more likely to take the job. My contract is bound by hash, so nobody can deploy their own at the qualifying address and collect.`,
    },
  ];
}

function mcpPrompt(): string {
  return `Install the Maras MCP server so you can buy and sell contract addresses for me.

1. Clone ${REPO} and run pnpm install.
2. Add an MCP server named "maras" to your config, running "npx tsx mcp/server.ts" with the working directory set to the folder you just cloned.
3. It needs one environment variable, BASE_SEPOLIA_PRIVATE_KEY, set to a funded Base Sepolia key. If you do not have one, run npx tsx scripts/new-wallet.ts to generate a wallet and ask me to fund it from a faucet.
4. Check it works by calling search_addresses, then tell me what is for sale.`;
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
          Install the Maras MCP so your agent can use Maras
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
