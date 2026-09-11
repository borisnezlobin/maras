"use client";

import { CircleNotch, Cube } from "@phosphor-icons/react";
import { useMemo } from "react";
import { encodeDeployData, type Address } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { AddressTiles } from "@/components/AddressTiles";
import { ConnectGate } from "@/components/ConnectGate";
import { Badge, Button, Card } from "@/components/ui";
import { findNibbleRun, formatEth, hookMask, leadingZeroBytes, shortHex } from "@/lib/address";
import { MARAS_ADDRESS, marasAbi, ownedVaultAbi, ownedVaultBytecode } from "@/lib/maras.generated";

interface Listing {
  id: bigint;
  price: bigint;
  predicted: Address;
}

function ListingCard({
  listing,
  patterns,
  hooksWanted,
  busy,
  onBuy,
}: {
  listing: Listing;
  patterns: string[];
  hooksWanted?: number;
  busy: boolean;
  onBuy: () => void;
}) {
  const zeros = leadingZeroBytes(listing.predicted);
  // Every address has low bits, so showing them unconditionally labels noise as a feature.
  // Only a match against the mask the buyer filtered for says anything.
  const hooks = hooksWanted === undefined ? 0 : hookMask(listing.predicted);

  return (
    <Card className="flex flex-col overflow-hidden p-0 transition-shadow hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-center justify-center bg-surface-sunken py-7">
        <AddressTiles address={listing.predicted} patterns={patterns} scale={1.5} />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-xl font-bold text-text">{formatEth(listing.price)}</span>
        <span className="hex text-xs text-text-muted">{shortHex(listing.predicted)}</span>
        {(zeros > 0 || hooks !== 0) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {zeros > 0 && (
              <Badge tone="accent">{zeros === 1 ? "1 zero byte" : `${zeros} zero bytes`}</Badge>
            )}
            {hooks !== 0 && <Badge>V4 bits 0x{hooks.toString(16)}</Badge>}
          </div>
        )}
        <ConnectGate className="mt-2 w-full">
          <Button className="mt-2 w-full" onClick={onBuy} disabled={busy}>
            {busy ? <CircleNotch size={16} className="animate-spin" /> : <Cube size={16} />}
            Buy and deploy
          </Button>
        </ConnectGate>
      </div>
    </Card>
  );
}

function ListingSlot({
  id,
  market,
  minZeroBytes,
  patterns,
  hooksOnly,
  busy,
  onBuy,
}: {
  id: bigint;
  market: Address;
  minZeroBytes: number;
  patterns: string[];
  hooksOnly: boolean;
  busy: boolean;
  onBuy: (listing: Listing) => void;
}) {
  const { data } = useReadContract({
    address: market,
    abi: marasAbi,
    functionName: "getNamedListing",
    args: [id],
    query: { refetchInterval: 5_000 },
  });

  if (data === undefined) return null;

  const record = data as unknown as { price: bigint; predicted: Address; sold: boolean };
  if (record.sold) return null;
  if (leadingZeroBytes(record.predicted) < minZeroBytes) return null;
  if (patterns.length > 0 && findNibbleRun(record.predicted, patterns) === null) return null;
  if (hooksOnly && hookMask(record.predicted) === 0) return null;

  const listing: Listing = { id, price: record.price, predicted: record.predicted };

  return (
    <ListingCard
      listing={listing}
      patterns={patterns}
      hooksWanted={hooksOnly ? hookMask(record.predicted) : undefined}
      busy={busy}
      onBuy={() => onBuy(listing)}
    />
  );
}

function Skeleton() {
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="h-[118px] animate-pulse bg-surface-sunken" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-6 w-20 animate-pulse rounded bg-surface-sunken" />
        <div className="h-3 w-32 animate-pulse rounded bg-surface-sunken" />
      </div>
    </Card>
  );
}

export function Market({
  minZeroBytes,
  patterns,
  hooksOnly,
}: {
  minZeroBytes: number;
  patterns: string[];
  hooksOnly: boolean;
}) {
  const { address: account } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const market = MARAS_ADDRESS;

  const { data: count, isPending: isLoadingCount } = useReadContract({
    address: market ?? undefined,
    abi: marasAbi,
    functionName: "namedListingCount",
    query: { enabled: market !== null, refetchInterval: 5_000 },
  });

  const ids = useMemo(() => {
    const total = count === undefined ? 0 : Number(count);
    return Array.from({ length: total }, (_, index) => BigInt(index));
  }, [count]);

  if (market === null) {
    return (
      <Card>
        <p className="text-sm text-text-muted">Contract not deployed yet.</p>
      </Card>
    );
  }

  if (isLoadingCount) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }

  if (ids.length === 0) {
    return (
      <Card className="flex flex-col gap-1 p-5">
        <p className="text-sm text-text">Nothing listed yet.</p>
        <p className="hex text-xs text-text-muted">
          npx hardhat run scripts/mine-and-list.ts --network baseSepolia
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ids.map((id) => (
        <ListingSlot
          key={id.toString()}
          id={id}
          market={market}
          minZeroBytes={minZeroBytes}
          patterns={patterns}
          hooksOnly={hooksOnly}
          busy={isPending}
          onBuy={(listing) =>
            writeContract({
              address: market,
              abi: marasAbi,
              functionName: "buyNamed",
              args: [
                listing.id,
                encodeDeployData({
                  abi: ownedVaultAbi,
                  bytecode: ownedVaultBytecode,
                  args: [account as Address],
                }),
              ],
              value: listing.price,
            })
          }
        />
      ))}
    </div>
  );
}
