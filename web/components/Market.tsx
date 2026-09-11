"use client";

import { CircleNotch, Cube, Hammer } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { encodeDeployData, type Address } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { AddressHex } from "@/components/AddressHex";
import { Badge, Button, Card, Field, Input, Stat } from "@/components/ui";
import {
  describeEffort,
  expectedAttempts,
  formatEth,
  leadingZeroBytes,
} from "@/lib/address";
import {
  MARAS_ADDRESS,
  marasAbi,
  ownedVaultAbi,
  ownedVaultBytecode,
} from "@/lib/maras.generated";

interface Listing {
  id: bigint;
  seller: Address;
  price: bigint;
  predicted: Address;
  sold: boolean;
}

function ListingRow({ listing, onBuy, busy }: { listing: Listing; onBuy: () => void; busy: boolean }) {
  const zeros = leadingZeroBytes(listing.predicted);
  const effort = describeEffort(expectedAttempts(zeros, false, false));

  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2 min-w-0">
        <AddressHex address={listing.predicted} size="lg" />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={zeros > 0 ? "accent" : "neutral"}>
            {zeros === 1 ? "1 leading zero byte" : `${zeros} leading zero bytes`}
          </Badge>
          <span className="text-xs text-text-subtle">{effort}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <Stat label="Price" value={formatEth(listing.price)} />
        <Button onClick={onBuy} disabled={busy}>
          {busy ? <CircleNotch size={16} className="animate-spin" /> : <Cube size={16} />}
          Buy and deploy here
        </Button>
      </div>
    </Card>
  );
}

function NotDeployed() {
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-base font-medium text-text">The market contract is not deployed yet</h2>
      <p className="text-sm text-text-muted">
        Run <span className="hex">npx hardhat run scripts/deploy.ts --network baseSepolia</span>, then
        regenerate the address with <span className="hex">npx tsx scripts/gen-web-abi.ts</span>.
      </p>
    </Card>
  );
}

export function Market() {
  const { address: account } = useAccount();
  const [minZeroBytes, setMinZeroBytes] = useState(0);
  const { writeContract, isPending } = useWriteContract();

  const market = MARAS_ADDRESS;

  const { data: count, isPending } = useReadContract({
    address: market ?? undefined,
    abi: marasAbi,
    functionName: "namedListingCount",
    query: { enabled: market !== null, refetchInterval: 5_000 },
  });

  const ids = useMemo(() => {
    const total = count === undefined ? BigInt(0) : count;
    return Array.from({ length: Number(total) }, (_, index) => BigInt(index));
  }, [count]);

  if (market === null) return <NotDeployed />;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Field label="Fewest leading zero bytes" hint="Each extra zero byte costs 256x the compute to mine.">
          <Input
            type="number"
            min={0}
            max={20}
            value={minZeroBytes}
            onChange={(event) => setMinZeroBytes(Number(event.target.value))}
            className="w-28"
          />
        </Field>
        <span className="text-sm text-text-muted">
          {isPending ? "Checking the chain…" : ids.length === 0 ? "Nothing listed yet" : `${ids.length} listed`}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {ids.map((id) => (
          <ListingSlot
            key={id.toString()}
            id={id}
            market={market}
            minZeroBytes={minZeroBytes}
            account={account}
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

      {!isPending && ids.length === 0 && (
        <Card className="flex items-center gap-3">
          <Hammer size={20} className="text-accent" />
          <p className="text-sm text-text-muted">
            Run the miner to put the first address up for sale:{" "}
            <span className="hex">npx hardhat run scripts/mine-and-list.ts --network baseSepolia</span>
          </p>
        </Card>
      )}
    </section>
  );
}

function ListingSlot({
  id,
  market,
  minZeroBytes,
  account,
  busy,
  onBuy,
}: {
  id: bigint;
  market: Address;
  minZeroBytes: number;
  account: Address | undefined;
  busy: boolean;
  onBuy: (listing: Listing) => void;
}) {
  const { data } = useReadContract({
    address: market,
    abi: marasAbi,
    functionName: "namedListings",
    args: [id],
  });

  if (data === undefined) return null;

  const [seller, price, , predicted, sold] = data as unknown as [
    Address,
    bigint,
    string,
    Address,
    boolean,
  ];

  if (sold) return null;
  if (leadingZeroBytes(predicted) < minZeroBytes) return null;

  const listing: Listing = { id, seller, price, predicted, sold };

  return (
    <ListingRow
      listing={listing}
      busy={busy || account === undefined}
      onBuy={() => onBuy(listing)}
    />
  );
}
