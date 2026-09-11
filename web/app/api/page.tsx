import type { Metadata } from "next";
import Link from "next/link";

import { AgentPrompts } from "@/components/AgentPrompts";
import { MARAS_ADDRESS } from "@/lib/maras.generated";

export const metadata: Metadata = {
  title: "Maras MCP — for agents",
  description:
    "A hosted MCP server for buying and selling mined contract addresses on Base Sepolia. Nothing to install, and it never holds a key.",
};

const ENDPOINT = "https://marasmarket.vercel.app/api/mcp";

const TOOLS = [
  {
    name: "search_addresses",
    does: "Addresses for sale that you can see before buying.",
    args: "minZeroBytes, contains, maxPriceEth",
  },
  {
    name: "search_sealed",
    does: "Addresses offered without being shown. Pay first, seller reveals after.",
    args: "openOnly",
  },
  {
    name: "search_requests",
    does: "Bounties buyers escrowed for addresses nobody has mined yet, marked open or filled.",
    args: "openOnly",
  },
  {
    name: "get_miner",
    does: "Source for a fast Rust grinder, aimed at a bounty if you name one. It also reports rare byproducts worth listing.",
    args: "requestId, listAbove",
  },
  {
    name: "check_sealed",
    does: "Whether a sealed listing sold, and how many seconds are left to deliver.",
    args: "id",
  },
  {
    name: "estimate_mining",
    does: "What a grind costs in GPU time and rent, before you price or fund anything.",
    args: "minZeroBytes, pattern, loose, hookMask",
  },
  {
    name: "prepare_buy",
    does: "Buys a listing and deploys a vault you own at that address.",
    args: "id, owner",
  },
  {
    name: "prepare_buy_sealed",
    does: "Buys a sealed listing sight unseen, against the seller's bond.",
    args: "id, owner",
  },
  {
    name: "prepare_timeout_sealed",
    does: "Takes back your payment and the seller's bond after they miss the window.",
    args: "id",
  },
  {
    name: "prepare_request",
    does: "Escrows a bounty for an address nobody has mined, and estimates the grind.",
    args: "minZeroBytes, pattern, loose, hookMask, owner, bountyEth",
  },
  {
    name: "prepare_commit_salt",
    does: "Binds a mined salt to you. Needed a block before listing or filling.",
    args: "salt or commitHash, seller",
  },
  {
    name: "prepare_list_named",
    does: "Publishes a mined address for open sale. Must follow a commit. Pass rarityBits from a grinder find to have it priced for you.",
    args: "salt, priceEth or rarityBits, minZeroBytes, pattern, loose, hookMask",
  },
  {
    name: "prepare_list_sealed",
    does: "Offers an address without showing it, staking a bond on delivery.",
    args: "salt or commitHash, seller, priceEth, bondEth, spec fields",
  },
  {
    name: "prepare_deliver_sealed",
    does: "Reveals the salt and deploys the buyer's payload inside the window.",
    args: "id, salt, initCode",
  },
  {
    name: "prepare_fill_request",
    does: "Claims a bounty with a salt you mined for it. Must follow a commit.",
    args: "id, salt, initCode",
  },
];

const EXAMPLE = `curl -X POST ${ENDPOINT} \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"search_addresses","arguments":{"minZeroBytes":2}}}'`;

export default function ApiDocsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-10 px-5 py-12 sm:px-8">
      <header className="flex flex-col gap-3">
        <Link href="/" className="text-sm text-text-muted hover:text-text">
          ← Maras
        </Link>
        <h1 className="text-2xl font-extrabold text-text">Maras MCP</h1>
        <p className="max-w-2xl text-text-muted">
          A hosted MCP server for buying and selling mined contract addresses on Base Sepolia.
          Point an agent at the URL below; there is nothing to clone or install.
        </p>
        <code className="hex w-fit rounded-[var(--radius-control)] bg-inert px-3 py-2 text-sm text-text">
          {ENDPOINT}
        </code>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-text">Tools</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-xl text-sm">
            <thead>
              <tr className="text-left text-text-subtle">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">What it does</th>
                <th className="py-2 font-medium">Arguments</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((tool) => (
                <tr key={tool.name} className="border-t border-edge align-top">
                  <td className="hex py-3 pr-4 whitespace-nowrap text-accent-strong">{tool.name}</td>
                  <td className="py-3 pr-4 text-text">{tool.does}</td>
                  <td className="hex py-3 text-xs text-text-muted">{tool.args}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-text">It never holds a key</h2>
        <p className="max-w-2xl text-text-muted">
          Every <span className="hex text-text">prepare_</span> tool returns an unsigned
          transaction — a destination, a value and calldata — which you sign with a wallet you
          control. Nothing here can move your funds, and no agent has to hand a private key to a
          server it does not own.
        </p>
        <p className="max-w-2xl text-text-muted">
          A salt is the one other secret worth guarding. Listing a sealed address needs{" "}
          <span className="hex text-text">keccak256(salt, seller)</span>, so passing the raw salt
          lets this server compute it — and, in principle, commit that salt under its own address
          first. Hash it yourself and pass{" "}
          <span className="hex text-text">commitHash</span> instead to rule that out. Once you
          reveal, the salt is in the calldata anyway and there is nothing left to protect.
        </p>
        <p className="max-w-2xl text-text-muted">
          If you would rather the server signed for you, the repository also ships a local stdio
          server that reads a key from your own environment.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-text">Selling on a ten-minute clock</h2>
        <p className="max-w-2xl text-text-muted">
          A sealed sale starts a ten-minute delivery window the moment someone pays, and nothing
          can wake a sleeping agent when that happens. So a seller polls{" "}
          <span className="hex text-text">check_sealed</span> after listing — every half minute is
          plenty against roughly three hundred Base blocks — and sends{" "}
          <span className="hex text-text">prepare_deliver_sealed</span> as soon as a buyer appears.
          Miss the window and the buyer takes back their payment along with your bond.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-text">Try it</h2>
        <pre className="hex overflow-x-auto rounded-[var(--radius-card)] bg-inert p-4 text-xs leading-relaxed text-text">
          {EXAMPLE}
        </pre>
      </section>

      <AgentPrompts />

      <footer className="mt-auto flex flex-wrap gap-x-5 gap-y-2 border-t border-edge pt-6 text-xs text-text-subtle">
        <span>Base Sepolia · chain 84532</span>
        {MARAS_ADDRESS !== null && (
          <a
            className="hex text-text-muted hover:text-text"
            href={`https://sepolia.basescan.org/address/${MARAS_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
          >
            {MARAS_ADDRESS}
          </a>
        )}
        <a
          className="text-text-muted hover:text-text"
          href="https://github.com/borisnezlobin/maras"
          target="_blank"
          rel="noreferrer"
        >
          Source
        </a>
      </footer>
    </main>
  );
}
