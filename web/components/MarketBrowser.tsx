"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useState } from "react";

import { HookPicker } from "@/components/HookPicker";
import { Market, type SortKey } from "@/components/Market";
import { SealedListings } from "@/components/SealedListings";
import { SiteHeader } from "@/components/SiteHeader";
import { ZeroBytesSlider } from "@/components/ZeroBytesSlider";
import { Input } from "@/components/ui";
import { spellingsForSearch } from "@/lib/listing";

const SORTS: ReadonlyArray<readonly [SortKey, string]> = [
  ["newest", "Newest"],
  ["rarest", "Rarest"],
  ["cheapest", "Cheapest"],
  ["permissions", "Most permissions"],
];

function SortControl({ sort, onChange }: { sort: SortKey; onChange: (next: SortKey) => void }) {
  return (
    <div className="flex items-center gap-2 sm:ms-auto">
      <span className="text-sm text-text-muted">Sort</span>
      <div className="flex flex-wrap items-center gap-1 rounded-full bg-surface p-1">
        {SORTS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            aria-pressed={sort === key}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
  );
}

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
  const [hookFlags, setHookFlags] = useState<number[]>([]);

  const patterns = spellingsForSearch(search);

  function toggleFlag(bit: number) {
    setHookFlags((current) =>
      current.includes(bit) ? current.filter((item) => item !== bit) : [...current, bit],
    );
  }

  return (
    <>
      <SiteHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div className="relative w-full max-w-md">
              <MagnifyingGlass
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-subtle"
              />
              <Input
                value={search}
                aria-label="Search addresses for a word or hex pattern"
                placeholder="cafe, tablet, deadbeef…"
                onChange={(event) => setSearch(event.target.value.trim())}
                className="w-full py-2.5 pl-10 text-base"
              />
            </div>
            <SortControl sort={sort} onChange={setSort} />
          </div>

          <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
            <ZeroBytesSlider value={minZeroBytes} onChange={setMinZeroBytes} />
            <div className="w-full max-w-md">
              <HookPicker
                flags={hookFlags}
                onToggle={toggleFlag}
                onClear={() => setHookFlags([])}
                pillAction="Only show addresses with"
                emptyLabel="Any"
                countNoun="selected"
                hint="A V4 hook declares its permissions through the low 14 bits of its own address. Picking some shows only addresses whose bits include them; the address may carry others too."
              />
            </div>
          </div>
        </div>
      </SiteHeader>

      <main className="flex flex-col gap-10 px-5 py-8 sm:px-8">
        <h1 className="sr-only">Contract addresses for sale</h1>
        <Market minZeroBytes={minZeroBytes} patterns={patterns} hookFlags={hookFlags} sort={sort} />
        <SealedListings />
      </main>
    </>
  );
}
