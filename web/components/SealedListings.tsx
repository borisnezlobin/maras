"use client";

import { ArrowCounterClockwise, CircleNotch, Lock, Timer } from "@phosphor-icons/react";
import { useMemo } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { ConnectGate } from "@/components/ConnectGate";
import { Badge, Button, Card, Hint } from "@/components/ui";
import { formatEth } from "@/lib/address";
import { declaredWords, displayWord, permissionNames } from "@/lib/listing";
import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";
import { payloadInitCodeHash } from "@/lib/payload";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface Spec {
  minZeroBytes: number;
  hookMask: number;
  checkHookMask: boolean;
  patterns: readonly Hex[];
  patternCount: number;
  patternNibbles: number;
}

interface SealedListing {
  seller: Address;
  price: bigint;
  bond: bigint;
  spec: Spec;
  buyer: Address;
  deadline: bigint;
  settled: boolean;
}

type Status = "available" | "awaiting" | "expiredForBuyer" | "expiredForOthers";

function minutesLeft(deadline: bigint): number {
  return Math.ceil((Number(deadline) - Math.floor(Date.now() / 1000)) / 60);
}

function statusOf(listing: SealedListing, account: Address | undefined): Status {
  if (listing.buyer === ZERO_ADDRESS) return "available";
  if (minutesLeft(listing.deadline) > 0) return "awaiting";
  const isBuyer = account !== undefined && listing.buyer.toLowerCase() === account.toLowerCase();
  return isBuyer ? "expiredForBuyer" : "expiredForOthers";
}

function HiddenTiles() {
  return (
    <div className="flex items-center justify-center rounded-t-[var(--radius-card)] bg-surface-sunken py-7">
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 20 }, (_, index) => (
          <div key={index} className="size-[27px] rounded bg-edge-strong/60" />
        ))}
      </div>
    </div>
  );
}

function SealedAction({
  status,
  listing,
  busy,
  onBuy,
  onRefund,
}: {
  status: Status;
  listing: SealedListing;
  busy: boolean;
  onBuy: () => void;
  onRefund: () => void;
}) {
  if (status === "available") {
    return (
      <ConnectGate className="mt-2 w-full">
        <Button className="mt-2 w-full" onClick={onBuy} disabled={busy}>
          {busy ? <CircleNotch size={16} className="animate-spin" /> : <Lock size={16} />}
          Buy unseen
        </Button>
      </ConnectGate>
    );
  }

  if (status === "awaiting") {
    return (
      <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-text-muted">
        <Timer size={15} className="text-accent" />
        {minutesLeft(listing.deadline)} min left to deliver
      </span>
    );
  }

  if (status === "expiredForBuyer") {
    return (
      <Button variant="secondary" className="mt-2 w-full" onClick={onRefund} disabled={busy}>
        <ArrowCounterClockwise size={16} />
        Claim refund and bond
      </Button>
    );
  }

  return <span className="mt-2 text-sm text-text-subtle">Window missed</span>;
}

function SealedSlot({
  id,
  market,
  account,
  busy,
  onBuy,
  onRefund,
}: {
  id: bigint;
  market: Address;
  account: Address | undefined;
  busy: boolean;
  onBuy: (id: bigint, price: bigint) => void;
  onRefund: (id: bigint) => void;
}) {
  const { data } = useReadContract({
    address: market,
    abi: marasAbi,
    functionName: "getSealedListing",
    args: [id],
    query: { refetchInterval: 10_000 },
  });

  if (data === undefined) return null;
  const listing = data as unknown as SealedListing;
  if (listing.settled) return null;

  const words = declaredWords(listing.spec);
  const permissions = permissionNames(listing.spec);

  return (
    <Card className="flex flex-col p-0">
      <HiddenTiles />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-xl font-bold text-text">{formatEth(listing.price)}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {listing.spec.minZeroBytes > 0 && (
            <Badge tone="accent">{listing.spec.minZeroBytes}+ zero bytes</Badge>
          )}
          {words.length > 0 && <Badge tone="accent">{displayWord(words[0])}</Badge>}
          {permissions.length > 0 && <Badge>{permissions.length} V4</Badge>}
          <Badge>{formatEth(listing.bond)} bond</Badge>
          {permissions.length > 0 && <Hint text={`Carries exactly: ${permissions.join(", ")}.`} />}
        </div>
        <SealedAction
          status={statusOf(listing, account)}
          listing={listing}
          busy={busy}
          onBuy={() => onBuy(id, listing.price)}
          onRefund={() => onRefund(id)}
        />
      </div>
    </Card>
  );
}

export function SealedListings() {
  const { address: account } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const market = MARAS_ADDRESS;

  const { data: count, isPending: loadingCount } = useReadContract({
    address: market ?? undefined,
    abi: marasAbi,
    functionName: "sealedListingCount",
    query: { enabled: market !== null, refetchInterval: 10_000 },
  });

  const ids = useMemo(() => {
    const total = count === undefined ? 0 : Number(count);
    return Array.from({ length: total }, (_, index) => BigInt(index)).reverse();
  }, [count]);

  if (market === null) return null;
  if (loadingCount) {
    return <div className="h-72 max-w-sm animate-pulse rounded-[var(--radius-card)] bg-surface-sunken" />;
  }
  if (ids.length === 0) {
    return (
      <Card className="max-w-md p-5">
        <p className="text-sm text-text-muted">Nothing sealed is for sale right now.</p>
      </Card>
    );
  }

  function buy(id: bigint, price: bigint) {
    writeContract({
      address: market as Address,
      abi: marasAbi,
      functionName: "buySealed",
      args: [id, payloadInitCodeHash(account as Address)],
      value: price,
    });
  }

  function refund(id: bigint) {
    writeContract({
      address: market as Address,
      abi: marasAbi,
      functionName: "timeoutSealed",
      args: [id],
    });
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {ids.map((id) => (
        <SealedSlot
          key={id.toString()}
          id={id}
          market={market}
          account={account}
          busy={isPending}
          onBuy={buy}
          onRefund={refund}
        />
      ))}
    </div>
  );
}
