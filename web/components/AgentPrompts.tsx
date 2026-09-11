"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";

import { Card } from "@/components/ui";
import { MARAS_ADDRESS } from "@/lib/maras.generated";

const REPO = "https://github.com/borisnezlobin/maras";

interface Prompt {
  title: string;
  blurb: string;
  body: string;
}

function setup(market: string): string {
  return `Clone ${REPO}, run pnpm install, and set a funded Base Sepolia key with npx hardhat keystore set BASE_SEPOLIA_PRIVATE_KEY. The marketplace is at ${market} on Base Sepolia.`;
}

function prompts(market: string): Prompt[] {
  const base = setup(market);

  return [
    {
      title: "Mine zero-byte addresses",
      blurb: "Leading zeros cut calldata gas on every future call, so these sell.",
      body: `${base}

Mine addresses with leading zero bytes and list them for sale:

  MINE_ZERO_BYTES=3 MINE_PRICE_ETH=0.002 npx hardhat run scripts/mine-and-list.ts --network baseSepolia

Each run prints the expected attempts before it starts. Raise MINE_ZERO_BYTES while runs stay under a minute and back off when one drags; every extra byte is 256 times the work. Keep going and report each address you list with its Basescan link.`,
    },
    {
      title: "Mine a Uniswap V4 hook address",
      blurb: "V4 reads a hook's permissions from its own address bits.",
      body: `${base}

Uniswap V4 encodes a hook's permission set in the low 14 bits of the hook contract's address, so deploying a hook with a given permission set requires mining a salt whose address carries exactly those bits.

Mine one and list it:

  MINE_HOOK_MASK=9216 MINE_ZERO_BYTES=1 npx hardhat run scripts/mine-and-list.ts --network baseSepolia

9216 is 0x2400, which is beforeInitialize plus afterAddLiquidity. Change the mask to whichever permissions you want. The 14 bits alone are only about 16k attempts, so add zero bytes or a word to make the result worth buying.`,
    },
    {
      title: "Mine a word",
      blurb: "cafe, b0b, deadbee — anything spellable in hex.",
      body: `${base}

Mine an address containing a word and list it:

  MINE_PATTERN=cafe MINE_LOOSE=1 npx hardhat run scripts/mine-and-list.ts --network baseSepolia

MINE_LOOSE=1 also accepts lookalike spellings, so cafe matches caf3, c4fe and c4f3 as well, and the grind gets about four times shorter. Patterns can be one to eight hex characters. Try longer words for rarer results, and report what each one cost in attempts.`,
    },
    {
      title: "Fill someone's open request",
      blurb: "Buyers escrow a bounty for addresses nobody has mined yet.",
      body: `${base}

Find an open request and mine what it asks for:

  npx hardhat run scripts/fill-request.ts --network baseSepolia

It picks the first unfilled request, reads its spec off chain, prints the expected mining time, then mines, commits, waits a block and fills it to collect the bounty. Set REQUEST_ID=n to target a specific one.

The buyer's payload is bound by hash, so you deploy their contract, not yours. If the script says it cannot reconstruct the payload, skip that request and try another.`,
    },
  ];
}

function mcpConfig(): string {
  return JSON.stringify(
    {
      mcpServers: {
        maras: {
          command: "npx",
          args: ["tsx", "mcp/server.ts"],
          cwd: "/path/to/maras",
          env: { BASE_SEPOLIA_PRIVATE_KEY: "0xyour-testnet-key" },
        },
      },
    },
    null,
    2,
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_600);
  }

  return (
    <button
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-surface-sunken px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-edge-strong hover:text-text"
    >
      {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function PromptCard({ prompt }: { prompt: Prompt }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-text">{prompt.title}</span>
          <span className="text-sm text-text-muted">{prompt.blurb}</span>
        </div>
        <CopyButton text={prompt.body} />
      </div>
    </Card>
  );
}

export function AgentPrompts() {
  if (MARAS_ADDRESS === null) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-bold text-text">Send an agent</h2>
        <span className="text-sm text-text-muted">Copy a job, paste it to yours</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {prompts(MARAS_ADDRESS).map((prompt) => (
          <PromptCard key={prompt.title} prompt={prompt} />
        ))}
      </div>

      <Card className="flex items-start justify-between gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-text">Or connect the MCP server</span>
          <span className="text-sm text-text-muted">
            search_addresses, buy_address, post_request, submit_salt
          </span>
        </div>
        <CopyButton text={mcpConfig()} />
      </Card>
    </section>
  );
}
