import type { Metadata } from "next";

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
    does: "Lists addresses for sale, newest contract first.",
    args: "minZeroBytes, contains, maxPriceEth — all optional",
  },
  {
    name: "prepare_buy",
    does: "Builds the transaction that buys a listing and deploys a vault you own at that address.",
    args: "id, owner",
  },
  {
    name: "prepare_request",
    does: "Builds the transaction that escrows a bounty for an address nobody has mined, and estimates the grind.",
    args: "minZeroBytes, pattern, loose, owner, bountyEth",
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
        <a href="/" className="text-sm text-text-muted hover:text-text">
          ← Maras
        </a>
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
          The two <span className="hex text-text">prepare_</span> tools return an unsigned
          transaction — a destination, a value and calldata — which you sign with a wallet you
          control. Nothing here can move your funds, and no agent has to hand a private key to a
          server it does not own.
        </p>
        <p className="max-w-2xl text-text-muted">
          If you would rather the server signed for you, the repository also ships a local stdio
          server that reads a key from your own environment.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-text">Try it</h2>
        <pre className="hex overflow-x-auto rounded-[var(--radius-card)] bg-inert p-4 text-xs leading-relaxed text-text">
          {EXAMPLE}
        </pre>
      </section>

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
