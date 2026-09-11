"use client";

import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useState } from "react";

import { AgentPrompts } from "@/components/AgentPrompts";
import { ConnectGate } from "@/components/ConnectGate";
import { Market } from "@/components/Market";
import { RequestDialog } from "@/components/RequestDialog";
import { SealedListings } from "@/components/SealedListings";
import { WalletButton } from "@/components/WalletButton";
import { Button, Input } from "@/components/ui";
import { expandLoose, isPatternShape } from "@/lib/leet";

const ZERO_CHOICES = [0, 1, 2, 3, 4];

export function Marketplace() {
  const [minZeroBytes, setMinZeroBytes] = useState(0);
  const [search, setSearch] = useState("");
  const [hooksOnly, setHooksOnly] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const patterns = isPatternShape(search) ? expandLoose(search, true) : [];

  return (
    <>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-edge bg-surface-raised px-4 py-3 sm:px-6 lg:px-10">
        <span className="text-lg font-extrabold tracking-tight text-text">Maras</span>

        <div className="relative order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-sm">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
          />
          <Input
            value={search}
            placeholder="Search for cafe, b0b, deadbee…"
            onChange={(event) => setSearch(event.target.value.trim())}
            className="w-full pl-9"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={() => setRequesting(true)}>
            <Plus size={16} />
            <span className="hidden sm:inline">Request one</span>
          </Button>
          <WalletButton />
        </div>
      </header>

      <div className="flex flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-text-muted">Leading zeros</span>
          {ZERO_CHOICES.map((value) => (
            <button
              key={value}
              onClick={() => setMinZeroBytes(value)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                minZeroBytes === value
                  ? "bg-control text-text-inverse"
                  : "bg-surface-raised text-text-muted hover:bg-surface-sunken"
              }`}
            >
              {value === 0 ? "Any" : `${value}+`}
            </button>
          ))}

          <span className="mx-2 h-5 w-px bg-edge-strong" />

          <button
            onClick={() => setHooksOnly(!hooksOnly)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              hooksOnly
                ? "bg-control text-text-inverse"
                : "bg-surface-raised text-text-muted hover:bg-surface-sunken"
            }`}
          >
            Uniswap V4 hooks
          </button>
        </div>

        <Market minZeroBytes={minZeroBytes} patterns={patterns} hooksOnly={hooksOnly} />
        <SealedListings />
        <AgentPrompts />
      </div>

      {requesting && <RequestDialog onClose={() => setRequesting(false)} />}
    </>
  );
}
