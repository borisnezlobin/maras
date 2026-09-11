"use client";

import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

import { Market, type SortKey } from "@/components/Market";
import { RequestDialog } from "@/components/RequestDialog";
import { SealedListings } from "@/components/SealedListings";
import { WalletButton } from "@/components/WalletButton";
import { ZeroBytesSlider } from "@/components/ZeroBytesSlider";
import { Button, Input } from "@/components/ui";
import { expandLoose, isPatternShape } from "@/lib/leet";

const SORTS: ReadonlyArray<readonly [SortKey, string]> = [
  ["newest", "Newest"],
  ["rarest", "Rarest"],
  ["cheapest", "Cheapest"],
];

export function MarketBrowser({
  initialSearch = "",
  initialZeroBytes = 0,
}: {
  initialSearch?: string;
  initialZeroBytes?: number;
}) {
  const [minZeroBytes, setMinZeroBytes] = useState(initialZeroBytes);
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState<SortKey>("newest");
  const [requesting, setRequesting] = useState(false);

  const patterns = isPatternShape(search) ? expandLoose(search, true) : [];

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-edge bg-surface-raised px-5 py-3 sm:px-8">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-text">
          Maras
        </Link>
        <div className="flex items-center gap-2">
          <Button onClick={() => setRequesting(true)}>
            <Plus size={16} />
            <span className="hidden sm:inline">Request an address</span>
          </Button>
          <WalletButton />
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-61px)] flex-col gap-10 px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-5">
          <div className="relative w-full max-w-md">
            <MagnifyingGlass
              size={18}
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-subtle"
            />
            <Input
              value={search}
              placeholder="cafe, b0b, deadbeef…"
              onChange={(event) => setSearch(event.target.value.trim())}
              className="w-full py-2.5 pl-10 text-base"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
            <ZeroBytesSlider value={minZeroBytes} onChange={setMinZeroBytes} />

            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Sort</span>
              <div className="flex items-center gap-1 rounded-full bg-surface-raised p-1">
                {SORTS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSort(key)}
                    aria-pressed={sort === key}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      sort === key
                        ? "bg-accent text-text-inverse"
                        : "bg-inert text-text-muted hover:bg-inert-hover"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Market minZeroBytes={minZeroBytes} patterns={patterns} sort={sort} />
        <SealedListings />
      </main>

      {requesting && <RequestDialog onClose={() => setRequesting(false)} />}
    </>
  );
}
