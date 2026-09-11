"use client";

import { ArrowsLeftRight, ArrowUpRight, Signpost } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { isAddress, isHex, type Address, type Hex } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { AddressText } from "@/components/AddressText";
import { AddressTiles } from "@/components/AddressTiles";
import { Badge, Button, Card, Field, Hint, Input } from "@/components/ui";
import { hookPermissions, leadingZeroBytes } from "@/lib/address";
import { declaredWords, displayWord } from "@/lib/listing";
import { ownedProxyAbi } from "@/lib/maras.generated";
import { findOwnedAddresses, OWNED_KEY, type AddressSource, type OwnedAddress } from "@/lib/owned";
import { transactionLabel, useTransaction } from "@/lib/useTransaction";

const EXPLORER = "https://sepolia.basescan.org/address/";

const SOURCE_LABEL: Record<AddressSource, (id: bigint) => string> = {
  request: (id) => `From your request #${id}`,
  named: (id) => `Bought from listing #${id}`,
  sealed: (id) => `Delivered from sealed #${id}`,
};

type Mode = "idle" | "point" | "transfer";

function ExplorerLink({ address, children }: { address: Address; children: ReactNode }) {
  return (
    <a
      href={`${EXPLORER}${address}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-[var(--radius-control)] text-sm font-semibold text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
      <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
    </a>
  );
}

function Failure({ message }: { message: string | null }) {
  if (message === null) return null;
  return <p className="text-sm text-accent-strong">{message}</p>;
}

function PointsTo({ implementation }: { implementation: Address | null }) {
  if (implementation === null) {
    return (
      <p className="text-sm text-text-muted">
        Not pointed at anything yet, so calls to it fail. It still takes ETH.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-subtle">Points to</span>
      <a
        href={`${EXPLORER}${implementation}`}
        target="_blank"
        rel="noreferrer"
        className="hex break-all text-xs text-text hover:text-accent"
      >
        {implementation}
      </a>
    </div>
  );
}

function PointForm({ address, onDone }: { address: Address; onDone: () => void }) {
  const [target, setTarget] = useState("");
  const [setup, setSetup] = useState("");
  const [withSetup, setWithSetup] = useState(false);
  const { writeContract, state } = useTransaction(onDone);

  const ready = isAddress(target) && (setup === "" || isHex(setup));
  const busy = state.signing || state.confirming;

  function submit() {
    writeContract({
      address,
      abi: ownedProxyAbi,
      functionName: "pointTo",
      args: [target as Address, (setup === "" ? "0x" : setup) as Hex],
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-text">
          Contract to point at
          <Hint text="Every call to your address runs that contract's code, against your address's own storage. A Uniswap V4 hook has to skip the usual check of its own address in its constructor, since that check would run at the contract's address rather than yours." />
        </span>
        <Input
          value={target}
          placeholder="0x…"
          aria-label="Contract to point at"
          onChange={(event) => setTarget(event.target.value.trim())}
          className="hex"
        />
      </div>

      {withSetup ? (
        <Field label="Setup call">
          <Input
            value={setup}
            placeholder="0x"
            onChange={(event) => setSetup(event.target.value.trim())}
            className="hex"
          />
        </Field>
      ) : (
        <button
          onClick={() => setWithSetup(true)}
          className="self-start rounded-[var(--radius-control)] text-xs text-text-muted underline hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          It needs a setup call
        </button>
      )}

      <Button onClick={submit} disabled={!ready || busy}>
        {transactionLabel(state, "Point it here", "Pointing…")}
      </Button>
      <Failure message={state.message} />
    </div>
  );
}

function TransferForm({ address, onDone }: { address: Address; onDone: () => void }) {
  const [next, setNext] = useState("");
  const [sure, setSure] = useState(false);
  const { writeContract, state } = useTransaction(onDone);
  const busy = state.signing || state.confirming;

  function submit() {
    writeContract({
      address,
      abi: ownedProxyAbi,
      functionName: "transferProxyOwnership",
      args: [next as Address],
    });
  }

  if (!sure) {
    return (
      <div className="flex flex-col gap-3">
        <Field label="New owner">
          <Input
            value={next}
            placeholder="0x…"
            onChange={(event) => setNext(event.target.value.trim())}
            className="hex"
          />
        </Field>
        <Button variant="secondary" onClick={() => setSure(true)} disabled={!isAddress(next)}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text">
        Only <span className="hex break-all">{next}</span> will be able to point or transfer this
        address. You cannot undo this.
      </p>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy}>
          {transactionLabel(state, "Transfer it", "Transferring…")}
        </Button>
        <Button variant="quiet" onClick={() => setSure(false)} disabled={busy}>
          Back
        </Button>
      </div>
      <Failure message={state.message} />
    </div>
  );
}

function ProxyControls({ owned, onChanged }: { owned: OwnedAddress; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode>("idle");

  function finish() {
    setMode("idle");
    onChanged();
  }

  if (mode === "point") return <PointForm address={owned.address} onDone={finish} />;
  if (mode === "transfer") return <TransferForm address={owned.address} onDone={finish} />;

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setMode("point")}>
        <Signpost size={16} aria-hidden="true" />
        {owned.implementation === null ? "Point at a contract" : "Point elsewhere"}
      </Button>
      <Button variant="quiet" onClick={() => setMode("transfer")}>
        <ArrowsLeftRight size={16} aria-hidden="true" />
        Transfer
      </Button>
    </div>
  );
}

function VaultNote() {
  return (
    <p className="text-sm text-text-muted">
      A vault that holds ETH only you can withdraw. It was bought before addresses could be
      pointed, so it cannot run any other code.
    </p>
  );
}

function OwnedCard({ owned, onChanged }: { owned: OwnedAddress; onChanged: () => void }) {
  const words = declaredWords(owned.spec);
  const zeros = leadingZeroBytes(owned.address);
  const permissions = hookPermissions(owned.address).length;

  return (
    <Card className="flex flex-col p-0">
      <div className="flex items-center justify-center rounded-t-[var(--radius-card)] bg-surface-sunken py-8">
        <AddressTiles address={owned.address} words={words} scale={1.5} />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <AddressText address={owned.address} words={words} className="text-xs leading-relaxed" />

        <div className="flex flex-wrap items-center gap-1.5">
          {zeros > 0 && (
            <Badge tone="accent">{zeros === 1 ? "1 zero byte" : `${zeros} zero bytes`}</Badge>
          )}
          {words.length > 0 && <Badge tone="accent">{displayWord(words[0])}</Badge>}
          <Badge>{permissions} V4</Badge>
        </div>

        {owned.kind === "proxy" ? <PointsTo implementation={owned.implementation} /> : <VaultNote />}

        <div className="mt-auto flex flex-col gap-4">
          {owned.kind === "proxy" && <ProxyControls owned={owned} onChanged={onChanged} />}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-text-muted">{SOURCE_LABEL[owned.source](owned.id)}</span>
            <ExplorerLink address={owned.address}>View on Basescan</ExplorerLink>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Loading() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1].map((key) => (
        <div key={key} className="h-80 animate-pulse rounded-[var(--radius-card)] bg-surface-sunken" />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <Card className="flex max-w-md flex-col items-start gap-4 p-5">
      <p className="text-sm text-text-muted">
        You do not own an address yet. Buy one, or request one and a miner will find it.
      </p>
      <Link href="/market">
        <Button>Browse addresses</Button>
      </Link>
    </Card>
  );
}

export function MyAddresses() {
  const { address: account } = useAccount();
  const client = usePublicClient();
  const queryClient = useQueryClient();

  const { data: owned, isPending } = useQuery({
    queryKey: [OWNED_KEY, account],
    queryFn: () =>
      client !== undefined && account !== undefined
        ? findOwnedAddresses(client, account)
        : Promise.resolve([]),
    enabled: client !== undefined && account !== undefined,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: [OWNED_KEY] });
  }

  if (isPending || owned === undefined) return <Loading />;
  if (owned.length === 0) return <Empty />;

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {owned.map((entry) => (
        <OwnedCard key={entry.address} owned={entry} onChanged={refresh} />
      ))}
    </div>
  );
}
