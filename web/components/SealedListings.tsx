"use client";

import { ArrowCounterClockwise, CircleNotch, Lock, Timer } from "@phosphor-icons/react";
import { useMemo } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { Badge, Button, Card, Stat } from "@/components/ui";
import { describeEffort, expectedAttempts, formatEth } from "@/lib/address";
import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";
import { vaultInitCodeHash } from "@/lib/payload";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface Spec {
  minZeroBytes: number;
  hookMask: number;
  checkHookMask: boolean;
  pattern: Hex;
  checkPattern: boolean;
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

function SpecBadges({ spec }: { spec: Spec }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge tone="accent">
        {spec.minZeroBytes === 1 ? "1 leading zero byte" : `${spec.minZeroBytes} leading zero bytes`}
      </Badge>
      {spec.checkPattern && <Badge tone="accent">contains {spec.pattern.slice(2)}</Badge>}
      {spec.checkHookMask && <Badge tone="accent">V4 hook bits 0x{spec.hookMask.toString(16)}</Badge>}
    </div>
  );
}

function SealedPlaceholder() {
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-control)] bg-surface-sunken px-3 py-2.5">
      <Lock size={16} weight="fill" className="shrink-0 text-accent" />
      <span className="hex text-sm text-text-subtle">{"●".repeat(40)}</span>
    </div>
  );
}

function SealedAction({
  status,
  listing,
  canAct,
  busy,
  onBuy,
  onRefund,
}: {
  status: Status;
  listing: SealedListing;
  canAct: boolean;
  busy: boolean;
  onBuy: () => void;
  onRefund: () => void;
}) {
  if (status === "available") {
    return (
      <Button onClick={onBuy} disabled={busy || !canAct}>
        {busy ? <CircleNotch size={16} className="animate-spin" /> : <Lock size={16} />}
        Buy without seeing it
      </Button>
    );
  }

  if (status === "awaiting") {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-text-muted">
        <Timer size={16} className="text-accent" />
        Seller has {minutesLeft(listing.deadline)} min to deliver
      </span>
    );
  }

  if (status === "expiredForBuyer") {
    return (
      <Button variant="secondary" onClick={onRefund} disabled={busy}>
        <ArrowCounterClockwise size={16} />
        Take refund and seller bond
      </Button>
    );
  }

  return <span className="text-sm text-text-subtle">Delivery window missed</span>;
}

function SealedCard({
  listing,
  account,
  busy,
  onBuy,
  onRefund,
}: {
  listing: SealedListing;
  account: Address | undefined;
  busy: boolean;
  onBuy: () => void;
  onRefund: () => void;
}) {
  const effort = describeEffort(
    expectedAttempts(
      listing.spec.minZeroBytes,
      listing.spec.checkHookMask,
      listing.spec.checkPattern,
    ),
  );

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <SealedPlaceholder />
        <SpecBadges spec={listing.spec} />
        <p className="text-xs text-text-subtle">Mining cost: {effort}</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-edge pt-4">
        <div className="flex gap-6">
          <Stat label="Price" value={formatEth(listing.price)} />
          <Stat label="Seller bond at risk" value={formatEth(listing.bond)} />
        </div>
        <SealedAction
          status={statusOf(listing, account)}
          listing={listing}
          canAct={account !== undefined}
          busy={busy}
          onBuy={onBuy}
          onRefund={onRefund}
        />
      </div>
    </Card>
  );
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
    query: { refetchInterval: 5_000 },
  });

  if (data === undefined) return null;

  const listing = data as unknown as SealedListing;
  if (listing.settled) return null;

  return (
    <SealedCard
      listing={listing}
      account={account}
      busy={busy}
      onBuy={() => onBuy(id, listing.price)}
      onRefund={() => onRefund(id)}
    />
  );
}

function EmptyState() {
  return (
    <Card>
      <p className="text-sm text-text-muted">
        Nothing sealed for sale yet. A seller lists one with <span className="hex">submit_salt</span>{" "}
        over MCP, or by calling <span className="hex">listSealed</span>.
      </p>
    </Card>
  );
}

export function SealedListings() {
  const { address: account } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const market = MARAS_ADDRESS;

  const { data: count, isPending: isLoadingCount } = useReadContract({
    address: market ?? undefined,
    abi: marasAbi,
    functionName: "sealedListingCount",
    query: { enabled: market !== null, refetchInterval: 5_000 },
  });

  const ids = useMemo(() => {
    const total = count === undefined ? 0 : Number(count);
    return Array.from({ length: total }, (_, index) => BigInt(index));
  }, [count]);

  if (market === null) return null;

  function buy(id: bigint, price: bigint) {
    writeContract({
      address: market as Address,
      abi: marasAbi,
      functionName: "buySealed",
      args: [id, vaultInitCodeHash(account as Address)],
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
    <section className="flex flex-col gap-4 px-6 sm:px-10">
      <h2 className="text-lg font-medium text-text">Sealed addresses</h2>
      <p className="max-w-2xl text-sm text-text-muted">
        The seller has committed to a salt but has not revealed it, so you are buying a guarantee
        about the shape of the address rather than a specific one. That suits you if you want the gas
        savings and do not care which address you get. Your payment is escrowed, and if the seller
        misses the delivery window you take back your money along with their bond.
      </p>

      {isLoadingCount ? (
        <Card>
          <p className="text-sm text-text-muted">Checking the chain…</p>
        </Card>
      ) : ids.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
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
      )}
    </section>
  );
}
