"use client";

import { CheckCircle, CircleNotch, Cube } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Address } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { AddressText } from "@/components/AddressText";
import { AddressTiles } from "@/components/AddressTiles";
import { ConnectGate } from "@/components/ConnectGate";
import { Badge, Button, Card, Hint } from "@/components/ui";
import {
  findNibbleRun,
  formatEth,
  hasPermissions,
  hookPermissions,
  leadingZeroBytes,
} from "@/lib/address";
import { declaredWords, displayWord, type NamedListingRecord } from "@/lib/listing";
import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";
import { OWNED_KEY } from "@/lib/owned";
import { payloadInitCode } from "@/lib/payload";
import { transactionLabel, useTransaction } from "@/lib/useTransaction";

export type SortKey = "rarest" | "cheapest" | "newest" | "permissions";

interface Listing {
  id: bigint;
  price: bigint;
  predicted: Address;
  words: string[];
  sold: boolean;
}

/** Leading zero bytes dominate, then a declared word, so rarity orders the way a buyer values it. */
function rarityOf(listing: Listing): number {
  return leadingZeroBytes(listing.predicted) * 10 + (listing.words.length > 0 ? 1 : 0);
}

const COMPARATORS: Record<SortKey, (a: Listing, b: Listing) => number> = {
  newest: (a, b) => Number(b.id - a.id),
  rarest: (a, b) => rarityOf(b) - rarityOf(a),
  cheapest: (a, b) => (a.price === b.price ? 0 : a.price < b.price ? -1 : 1),
  permissions: (a, b) =>
    hookPermissions(b.predicted).length - hookPermissions(a.predicted).length,
};

function Bought() {
  return (
    <div className="mt-auto flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
        <CheckCircle size={16} weight="fill" aria-hidden="true" />
        It&rsquo;s yours
      </span>
      <Link
        href="/addresses"
        className="self-start rounded-[var(--radius-control)] text-sm font-semibold text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Point it in My addresses
      </Link>
    </div>
  );
}

function BuyButton({ listing, onBought }: { listing: Listing; onBought: (id: bigint) => void }) {
  const { address: account } = useAccount();
  const { writeContract, state } = useTransaction(() => onBought(listing.id));
  const busy = state.signing || state.confirming;

  if (state.confirmed || listing.sold) return <Bought />;

  function buy() {
    writeContract({
      address: MARAS_ADDRESS as Address,
      abi: marasAbi,
      functionName: "buyNamed",
      args: [listing.id, payloadInitCode(account as Address)],
      value: listing.price,
    });
  }

  return (
    <div className="mt-auto flex flex-col gap-2">
      <ConnectGate className="w-full">
        <Button className="w-full" onClick={buy} disabled={busy}>
          {busy ? (
            <CircleNotch size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Cube size={16} aria-hidden="true" />
          )}
          {transactionLabel(state, "Buy and deploy", "Buying…")}
        </Button>
      </ConnectGate>
      {state.message !== null && <p className="text-sm text-accent-strong">{state.message}</p>}
    </div>
  );
}

function ListingCard({ listing, onBought }: { listing: Listing; onBought: (id: bigint) => void }) {
  const zeros = leadingZeroBytes(listing.predicted);
  const permissions = hookPermissions(listing.predicted);

  return (
    <Card className="flex flex-col p-0 transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-center justify-center rounded-t-[var(--radius-card)] bg-surface-sunken py-8">
        <AddressTiles address={listing.predicted} words={listing.words} scale={1.5} />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <span className="text-xl font-bold text-text">{formatEth(listing.price)}</span>
        <AddressText
          address={listing.predicted}
          words={listing.words}
          className="text-xs leading-relaxed"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {zeros > 0 && (
            <Badge tone="accent">{zeros === 1 ? "1 zero byte" : `${zeros} zero bytes`}</Badge>
          )}
          {listing.words.length > 0 && (
            <Badge tone="accent">{displayWord(listing.words[0])}</Badge>
          )}
          <Badge>{permissions.length} V4</Badge>
          <Hint
            text={
              permissions.length === 0
                ? "None of the Uniswap V4 permission bits are set, so this address cannot act as a hook."
                : `Usable as a Uniswap V4 hook with: ${permissions.join(", ")}.`
            }
          />
        </div>

        <BuyButton listing={listing} onBought={onBought} />
      </div>
    </Card>
  );
}

function Skeleton() {
  return (
    <Card className="flex flex-col p-0">
      <div className="h-[130px] animate-pulse rounded-t-[var(--radius-card)] bg-surface-sunken" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-6 w-20 animate-pulse rounded bg-surface-sunken" />
        <div className="h-3 w-full animate-pulse rounded bg-surface-sunken" />
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <p className="text-sm text-text">Nothing matches yet.</p>
      <p className="hex text-xs text-text-muted">
        npx hardhat run scripts/mine-and-list.ts --network baseSepolia
      </p>
    </Card>
  );
}

function toListing(id: bigint, record: NamedListingRecord): Listing {
  return {
    id,
    price: record.price,
    predicted: record.predicted,
    words: declaredWords(record.spec),
    sold: record.sold,
  };
}

interface Filters {
  minZeroBytes: number;
  patterns: string[];
  hookFlags: number[];
}

function keep(listing: Listing, filters: Filters): boolean {
  if (leadingZeroBytes(listing.predicted) < filters.minZeroBytes) return false;
  if (!hasPermissions(listing.predicted, filters.hookFlags)) return false;
  if (filters.patterns.length === 0) return true;
  return findNibbleRun(listing.predicted, filters.patterns) !== null;
}

export function Market({
  minZeroBytes,
  patterns,
  hookFlags,
  sort = "newest",
}: {
  minZeroBytes: number;
  patterns: string[];
  hookFlags: number[];
  sort?: SortKey;
}) {
  const market = MARAS_ADDRESS;
  const queryClient = useQueryClient();
  // A listing bought from this page stays on it, showing where it went, instead of vanishing on
  // the next poll the moment it is marked sold.
  const [boughtHere, setBoughtHere] = useState<ReadonlySet<string>>(new Set());

  function markBought(id: bigint) {
    setBoughtHere((current) => new Set(current).add(id.toString()));
    void queryClient.invalidateQueries({ queryKey: [OWNED_KEY] });
  }

  const { data: count, isPending: isLoadingCount } = useReadContract({
    address: market ?? undefined,
    abi: marasAbi,
    functionName: "namedListingCount",
    query: { enabled: market !== null, refetchInterval: 10_000 },
  });

  // Read every listing in one batch so this component holds the records and can order them.
  // Fetching per card left the parent with nothing to sort by.
  const calls = useMemo(() => {
    const total = count === undefined ? 0 : Number(count);
    return Array.from({ length: total }, (_, index) => ({
      address: market ?? undefined,
      abi: marasAbi,
      functionName: "getNamedListing" as const,
      args: [BigInt(index)] as const,
    }));
  }, [count, market]);

  const { data: records } = useReadContracts({
    contracts: calls,
    query: { enabled: calls.length > 0, refetchInterval: 10_000 },
  });

  const listings = useMemo(() => {
    if (records === undefined) return [];

    const found: Listing[] = [];
    records.forEach((entry, index) => {
      if (entry.status !== "success") return;
      const record = entry.result as unknown as NamedListingRecord;
      if (record.sold && !boughtHere.has(index.toString())) return;
      found.push(toListing(BigInt(index), record));
    });

    return found
      .filter((listing) => keep(listing, { minZeroBytes, patterns, hookFlags }))
      .sort(COMPARATORS[sort]);
  }, [records, minZeroBytes, patterns, hookFlags, sort, boughtHere]);

  if (market === null) {
    return (
      <Card>
        <p className="text-sm text-text-muted">Contract not deployed yet.</p>
      </Card>
    );
  }

  if (isLoadingCount || (calls.length > 0 && records === undefined)) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }

  if (listings.length === 0) return <EmptyState />;


  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard
          key={listing.id.toString()}
          listing={listing}
          onBought={markBought}
        />
      ))}
    </div>
  );
}
