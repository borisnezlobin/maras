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
  return `Clone ${REPO}, run pnpm install, and set a funded Base Sepolia key with npx hardhat keystore set BASE_SEPOLIA_PRIVATE_KEY. The marketplace is at ${market} on Base Sepolia.`;
}

function earnJobs(market: string): Job[] {
  const base = setup(market);
  return [
    {
      label: "Mine addresses with leading zero bytes",
      body: `${base}\n\nMine addresses with leading zero bytes and list them:\n\n  MINE_ZERO_BYTES=3 MINE_PRICE_ETH=0.002 npx hardhat run scripts/mine-and-list.ts --network baseSepolia\n\nEach run prints the expected attempts first. Raise MINE_ZERO_BYTES while runs stay quick and back off when one drags; every extra byte is 256 times the work. Report each address you list with its Basescan link.`,
    },
    {
      label: "Mine a Uniswap V4 hook address",
      body: `${base}\n\nUniswap V4 encodes a hook's permission set in the low 14 bits of the hook contract's own address, so deploying a hook with a given permission set requires mining a salt whose address carries exactly those bits.\n\n  MINE_HOOK_MASK=9216 MINE_ZERO_BYTES=1 npx hardhat run scripts/mine-and-list.ts --network baseSepolia\n\n9216 is 0x2400, meaning beforeInitialize plus afterAddLiquidity. Change the mask for other permissions. The 14 bits alone are only about 16k attempts, so add zero bytes or a word to make the result worth buying.`,
    },
    {
      label: "Mine a word like cafe or deadbeef",
      body: `${base}\n\n  MINE_PATTERN=cafe MINE_LOOSE=1 npx hardhat run scripts/mine-and-list.ts --network baseSepolia\n\nMINE_LOOSE=1 also accepts lookalike spellings, so cafe matches caf3, c4fe and c4f3 and the grind gets about four times shorter. Patterns are one to eight hex characters and can start anywhere in the address. Report what each one cost in attempts.`,
    },
    {
      label: "Fill an open request for its bounty",
      body: `${base}\n\n  npx hardhat run scripts/fill-request.ts --network baseSepolia\n\nIt takes the first unfilled request, reads its spec off chain, prints the expected mining time, then mines, commits, waits a block and fills it to collect the bounty. Set REQUEST_ID=n to target a specific one.\n\nThe buyer's payload is bound by hash, so you deploy their contract rather than your own. If the script cannot reconstruct the payload, skip that request.`,
    },
  ];
}

function buyJobs(market: string): Job[] {
  return [
    {
      label: "Buy me the best address on the market",
      body: `Use the Maras MCP server on Base Sepolia (${market}).\n\n1. Call search_addresses with minZeroBytes 2 to see what is for sale.\n2. Pick the best value. More leading zero bytes is rarer and saves gas on every future call, so weigh that against price.\n3. Call buy_address with that listing id and owner set to my wallet address.\n\nPayment and deployment happen in one transaction, so a failed purchase costs only gas. Tell me what you bought, what it cost, and the Basescan link.`,
    },
    {
      label: "Post a bounty for an address nobody has mined",
      body: `Use the Maras MCP server on Base Sepolia (${market}).\n\nCall post_request with minZeroBytes 3, pattern cafe, loose true, owner set to my wallet address, and bountyEth 0.01.\n\nLoose matching accepts lookalike spellings, which shortens the grind and makes a miner more likely to take the job. My payload is bound by hash, so nobody can deploy their own contract at the qualifying address and collect. Tell me the bound payload hash.`,
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

function JobRows({ heading, jobs }: { heading: string; jobs: Job[] }) {
  return (
    <div className="flex flex-col">
      <span className="px-4 py-2 text-xs font-semibold text-text-subtle">{heading}</span>
      {jobs.map((job) => (
        <div
          key={job.label}
          className="flex items-center justify-between gap-3 border-t border-edge px-4 py-2.5"
        >
          <span className="text-sm text-text">{job.label}</span>
          <CopyControl text={job.body} label={`Copy prompt: ${job.label}`} />
        </div>
      ))}
    </div>
  );
}

export function AgentPrompts() {
  if (MARAS_ADDRESS === null) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-text">Connect your agent</h2>

      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-text">MCP server</span>
          <span className="hex text-xs text-text-muted">
            search_addresses · buy_address · post_request · submit_salt
          </span>
        </div>
        <CopyControl text={mcpConfig()} label="Copy MCP server config" />
      </Card>

      <Card className="p-0">
        <JobRows heading="Earn" jobs={earnJobs(MARAS_ADDRESS)} />
        <JobRows heading="Buy" jobs={buyJobs(MARAS_ADDRESS)} />
      </Card>
    </section>
  );
}
