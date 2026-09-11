import { ArrowSquareOut, Lock, ShieldCheck } from "@phosphor-icons/react/dist/ssr";

import { Market } from "@/components/Market";
import { RequestForm } from "@/components/RequestForm";
import { SealedListings } from "@/components/SealedListings";
import { WalletButton } from "@/components/WalletButton";
import { Card } from "@/components/ui";
import { MARAS_ADDRESS } from "@/lib/maras.generated";

const DIFFICULTY_ROWS = [
  { target: "Contains deadbeef", attempts: "2³²", time: "7 seconds" },
  { target: "5 leading zero bytes", attempts: "2⁴⁰", time: "31 minutes" },
  { target: "deadbeef plus V4 hook bits", attempts: "2⁴⁶", time: "33 hours" },
  { target: "6 leading zero bytes", attempts: "2⁴⁸", time: "5.4 days" },
];

function Header() {
  return (
    <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
      <span className="text-base font-semibold text-text">Maras</span>
      <WalletButton />
    </header>
  );
}

function Intro() {
  return (
    <section className="flex flex-col gap-5 px-6 sm:px-10">
      <h1 className="max-w-3xl text-3xl leading-tight font-semibold text-text sm:text-4xl">
        Buy a contract address somebody already spent the compute to find
      </h1>
      <p className="max-w-2xl text-base text-text-muted">
        A contract&apos;s address is a hash, so the only way to get a rare one — leading zero bytes
        that cut calldata gas, or the exact low bits a Uniswap V4 hook needs — is to grind salts until
        one lands. Miners here do that work up front and sell the result. You bring your own contract
        and it deploys at that address in a single transaction.
      </p>
    </section>
  );
}

function WhyItCosts() {
  return (
    <section className="flex flex-col gap-4 px-6 sm:px-10">
      <h2 className="text-lg font-medium text-text">What each target costs to mine</h2>
      <p className="max-w-2xl text-sm text-text-muted">
        Every constrained bit doubles the work, so difficulty climbs fast. Times assume one strong GPU
        at roughly 600 million candidate addresses per second.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-lg text-sm">
          <thead>
            <tr className="text-left text-text-subtle">
              <th className="py-2 pr-4 font-medium">Target</th>
              <th className="py-2 pr-4 font-medium">Expected tries</th>
              <th className="py-2 font-medium">One GPU</th>
            </tr>
          </thead>
          <tbody>
            {DIFFICULTY_ROWS.map((row) => (
              <tr key={row.target} className="border-t border-edge">
                <td className="py-2.5 pr-4 text-text">{row.target}</td>
                <td className="py-2.5 pr-4 text-text-muted">{row.attempts}</td>
                <td className="py-2.5 text-text-muted">{row.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="max-w-2xl text-sm text-text-muted">
        Below about a day of grinding, most people just run the miner themselves. The market exists
        above that line.
      </p>
    </section>
  );
}

function Protections() {
  return (
    <section className="grid gap-4 px-6 sm:grid-cols-2 sm:px-10">
      <Card className="flex flex-col gap-2">
        <ShieldCheck size={20} className="text-accent" />
        <h2 className="text-base font-medium text-text">The contract checks the claim, not the seller</h2>
        <p className="text-sm text-text-muted">
          Maras is the factory, so it derives the address from the salt and verifies the advertised
          zero bytes, hook mask and pattern on chain. A false claim reverts, and a reverted purchase
          costs you nothing. No private key exists for a sold address, so nobody can keep a copy of
          one.
        </p>
      </Card>
      <Card className="flex flex-col gap-2">
        <Lock size={20} className="text-accent" />
        <h2 className="text-base font-medium text-text">Sealed sales you cannot inspect first</h2>
        <p className="text-sm text-text-muted">
          A seller can list only a commitment and a claimed tier, which suits buyers who want five
          zero bytes and do not care which address they get. Your payment is escrowed, the seller has
          a delivery window, and missing it refunds you and takes their bond.
        </p>
      </Card>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-sm text-text-subtle sm:px-10">
      <span>Base Sepolia testnet</span>
      {MARAS_ADDRESS === null ? (
        <span>Contract not deployed yet</span>
      ) : (
        <a
          className="inline-flex items-center gap-1.5 text-text-muted hover:text-text"
          href={`https://sepolia.basescan.org/address/${MARAS_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
        >
          <span className="hex">{MARAS_ADDRESS}</span>
          <ArrowSquareOut size={14} />
        </a>
      )}
    </footer>
  );
}

export default function Page() {
  return (
    <>
      <Header />
      <main className="flex flex-col gap-14 py-8">
        <Intro />
        <WhyItCosts />
        <section className="flex flex-col gap-4 px-6 sm:px-10">
          <h2 className="text-lg font-medium text-text">Addresses for sale</h2>
          <Market />
        </section>
        <SealedListings />
        <RequestForm />
        <Protections />
      </main>
      <Footer />
    </>
  );
}
