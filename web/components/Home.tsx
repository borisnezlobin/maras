"use client";

import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SaltCrystal } from "@/components/SaltCrystal";
import { ZeroBytesSlider } from "@/components/ZeroBytesSlider";
import { Button, Input } from "@/components/ui";
import { MARAS_ADDRESS } from "@/lib/maras.generated";

const COSTS: ReadonlyArray<readonly [string, string]> = [
  ["Contains deadbeef", "7 seconds"],
  ["5 leading zero bytes", "31 minutes"],
  ["deadbeef and V4 hook bits", "33 hours"],
  ["6 leading zero bytes", "5.4 days"],
];

function Hero() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [minZeroBytes, setMinZeroBytes] = useState(0);

  function browse() {
    const params = new URLSearchParams();
    if (search !== "") params.set("q", search);
    if (minZeroBytes > 0) params.set("zeros", String(minZeroBytes));
    router.push(params.size === 0 ? "/market" : `/market?${params}`);
  }

  return (
    <section className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6 sm:px-12">
      <SaltCrystal className="pointer-events-auto absolute inset-y-0 right-0 hidden w-1/2 lg:block" />

      <div className="relative z-10 flex max-w-2xl flex-col gap-10 py-20">
        <div className="flex flex-col gap-4">
          <h1 className="text-6xl font-extrabold tracking-tight text-text sm:text-7xl">Maras</h1>
          <p className="text-2xl font-semibold text-accent sm:text-3xl">Your perfect address.</p>
          <p className="max-w-lg text-lg text-text-muted">
            Contract addresses someone already spent the compute to find.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <div className="relative w-full max-w-md">
            <MagnifyingGlass
              size={20}
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-subtle"
            />
            <Input
              value={search}
              placeholder="cafe, b0b, deadbeef…"
              onChange={(event) => setSearch(event.target.value.trim())}
              onKeyDown={(event) => event.key === "Enter" && browse()}
              className="w-full py-3 pl-12 text-base"
            />
          </div>

          <ZeroBytesSlider value={minZeroBytes} onChange={setMinZeroBytes} />

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={browse} className="px-5 py-2.5 text-base">
              Browse addresses
              <ArrowRight size={18} weight="bold" />
            </Button>
            <Link href="/api">
              <Button variant="secondary" className="px-5 py-2.5 text-base">
                Onboard your agent
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function WhatItIs() {
  return (
    <section className="flex flex-col gap-12 px-6 py-24 sm:px-12">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col gap-5">
          <h2 className="text-3xl font-extrabold text-text">
            An address is a hash, so you have to go looking
          </h2>
          <p className="text-lg text-text-muted">
            You cannot choose a contract address. You try salts until one comes out the shape you
            want, and the shape costs GPU time.
          </p>
          <p className="text-lg text-text-muted">
            Miners here sell what they found along the way, and take bounties for what nobody has
            found yet.
          </p>
        </div>

        <table className="w-full self-center text-left">
          <tbody>
            {COSTS.map(([target, time], index) => (
              <tr key={target} className={index === 0 ? "" : "border-t border-edge"}>
                <td className="py-4 pr-6 text-text">{target}</td>
                <td className="py-4 text-right font-semibold text-accent">{time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-edge px-6 py-8 text-xs text-text-subtle sm:px-12">
      <Link href="/present" className="text-text-muted hover:text-text">
        Slides
      </Link>
      <Link href="/api" className="text-text-muted hover:text-text">
        Agents
      </Link>
      <a
        className="text-text-muted hover:text-text"
        href="https://github.com/borisnezlobin/maras"
        target="_blank"
        rel="noreferrer"
      >
        Source
      </a>
      <span>Base Sepolia</span>
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
    </footer>
  );
}

export function Home() {
  return (
    <>
      <Hero />
      <WhatItIs />
      <Footer />
    </>
  );
}
