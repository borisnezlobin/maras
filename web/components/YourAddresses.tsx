"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";

import { AddressText } from "@/components/AddressText";
import { AddressTiles } from "@/components/AddressTiles";
import { Badge, Card, Hint } from "@/components/ui";
import { hookPermissions, leadingZeroBytes } from "@/lib/address";
import { declaredWords } from "@/lib/listing";
import { findOwnedAddresses, type AddressSource, type OwnedAddress } from "@/lib/owned";

const SOURCE_LABEL: Record<AddressSource, (id: bigint) => string> = {
  request: (id) => `From your request #${id}`,
  named: (id) => `Bought from listing #${id}`,
  sealed: (id) => `Delivered from sealed #${id}`,
};

function OwnedCard({ owned }: { owned: OwnedAddress }) {
  const words = declaredWords(owned.spec);
  const zeros = leadingZeroBytes(owned.address);
  const permissions = hookPermissions(owned.address).length;

  return (
    <Card className="flex flex-col p-0">
      <div className="flex items-center justify-center rounded-t-[var(--radius-card)] bg-surface-sunken py-8">
        <AddressTiles address={owned.address} words={words} scale={1.5} />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <AddressText address={owned.address} words={words} className="text-xs leading-relaxed" />

        <div className="flex flex-wrap items-center gap-1.5">
          {zeros > 0 && (
            <Badge tone="accent">{zeros === 1 ? "1 zero byte" : `${zeros} zero bytes`}</Badge>
          )}
          {words.length > 0 && <Badge tone="accent">{words[0]}</Badge>}
          <Badge>{permissions} V4</Badge>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs text-text-muted">{SOURCE_LABEL[owned.source](owned.id)}</span>
          <a
            href={`https://sepolia.basescan.org/address/${owned.address}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-[var(--radius-control)] text-sm font-semibold text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            View on Basescan
            <ArrowUpRight size={14} weight="bold" aria-hidden="true" />
          </a>
        </div>
      </div>
    </Card>
  );
}

export function YourAddresses() {
  const { address: account } = useAccount();
  const client = usePublicClient();

  const { data: owned } = useQuery({
    queryKey: ["owned-addresses", account],
    queryFn: () =>
      client !== undefined && account !== undefined
        ? findOwnedAddresses(client, account)
        : Promise.resolve([]),
    enabled: client !== undefined && account !== undefined,
    refetchInterval: 30_000,
  });

  if (owned === undefined || owned.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-text">Your addresses</h2>
        <Hint text="No private key exists for these. Each address holds a contract whose owner is your wallet, and nothing else can ever be deployed there." />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {owned.map((entry) => (
          <OwnedCard key={entry.address} owned={entry} />
        ))}
      </div>
    </section>
  );
}
