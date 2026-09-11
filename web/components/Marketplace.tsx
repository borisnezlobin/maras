"use client";

import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useState } from "react";

import { AgentPrompts } from "@/components/AgentPrompts";
import { Market } from "@/components/Market";
import { RequestDialog } from "@/components/RequestDialog";
import { SealedListings } from "@/components/SealedListings";
import { WalletButton } from "@/components/WalletButton";
import { Button, Input } from "@/components/ui";
import { expandLoose, isPatternShape } from "@/lib/leet";

const ZERO_CHOICES = [0, 1, 2, 3, 4];

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-accent text-text-inverse"
          : "bg-inert text-text-muted hover:bg-inert-hover"
      }`}
    >
      {children}
    </button>
  );
}

export function Marketplace() {
  const [minZeroBytes, setMinZeroBytes] = useState(0);
  const [search, setSearch] = useState("");
  const [hooksOnly, setHooksOnly] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const patterns = isPatternShape(search) ? expandLoose(search, true) : [];

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-edge bg-surface-raised px-4 py-3 sm:px-6 lg:px-10">
        <span className="text-lg font-extrabold tracking-tight text-text">Maras</span>
        <div className="flex items-center gap-2">
          <Button onClick={() => setRequesting(true)}>
            <Plus size={16} />
            <span className="hidden sm:inline">Request an address</span>
          </Button>
          <WalletButton />
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-61px)] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="relative w-full sm:w-64">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
            />
            <Input
              value={search}
              placeholder="cafe, b0b, deadbeef…"
              onChange={(event) => setSearch(event.target.value.trim())}
              className="w-full pl-9"
            />
          </div>

          {/* One group picks a minimum, the other is an independent switch, so they are
              separated rather than run together as one undifferentiated row. */}
          <div className="flex items-center gap-1 rounded-full bg-surface-raised p-1">
            {ZERO_CHOICES.map((value) => (
              <FilterPill
                key={value}
                active={minZeroBytes === value}
                onClick={() => setMinZeroBytes(value)}
              >
                {value === 0 ? "Any" : `${value}+`}
              </FilterPill>
            ))}
            <span className="px-2 text-xs text-text-subtle">zero bytes</span>
          </div>

          <FilterPill active={hooksOnly} onClick={() => setHooksOnly(!hooksOnly)}>
            Uniswap V4 hooks
          </FilterPill>
        </div>

        <Market minZeroBytes={minZeroBytes} patterns={patterns} hooksOnly={hooksOnly} />
        <SealedListings />
      </div>

      <div className="px-4 pb-10 sm:px-6 lg:px-10">
        <AgentPrompts />
      </div>

      {requesting && <RequestDialog onClose={() => setRequesting(false)} />}
    </>
  );
}
