"use client";

import { CheckCircle, Hourglass } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts } from "wagmi";

import { AddressText } from "@/components/AddressText";
import { RequestDialog } from "@/components/RequestDialog";
import { Badge, Button, Card, Hint } from "@/components/ui";
import { formatEth, HOOK_FLAGS } from "@/lib/address";
import { declaredWords, displayWord, type OnChainSpec } from "@/lib/listing";
import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";
import { findDeliveries } from "@/lib/owned";

interface RequestRecord {
  buyer: Address;
  bounty: bigint;
  spec: OnChainSpec;
  initCodeHash: Hex;
  filled: boolean;
}

interface OwnRequest {
  id: bigint;
  record: RequestRecord;
}

function permissionNames(spec: OnChainSpec): string[] {
  if (!spec.checkHookMask) return [];
  return HOOK_FLAGS.filter(([bit]) => ((spec.hookMask >> bit) & 1) === 1).map(([, name]) => name);
}

function Delivered({ address }: { address: Address | undefined }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
        <CheckCircle size={16} weight="fill" aria-hidden="true" />
        Delivered
      </span>
      {address !== undefined && (
        <AddressText address={address} words={[]} className="text-xs leading-relaxed" />
      )}
      <Link
        href="/addresses"
        className="self-start rounded-[var(--radius-control)] text-sm font-semibold text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Use it in My addresses
      </Link>
    </div>
  );
}

function Waiting() {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
      <Hourglass size={16} className="text-text-subtle" aria-hidden="true" />
      Waiting for a miner
    </span>
  );
}

function RequestCard({ id, record, delivered }: OwnRequest & { delivered: Address | undefined }) {
  const words = declaredWords(record.spec);
  const permissions = permissionNames(record.spec);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xl font-bold text-text">{formatEth(record.bounty)}</span>
        <span className="text-xs text-text-subtle">#{id.toString()}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {record.spec.minZeroBytes > 0 && (
          <Badge tone="accent">
            {record.spec.minZeroBytes === 1 ? "1 zero byte" : `${record.spec.minZeroBytes} zero bytes`}
          </Badge>
        )}
        {words.length > 0 && <Badge tone="accent">{displayWord(words[0])}</Badge>}
        {permissions.length > 0 && <Badge>{permissions.length} V4</Badge>}
        {permissions.length > 0 && <Hint text={`Must carry exactly: ${permissions.join(", ")}.`} />}
      </div>

      {record.filled ? <Delivered address={delivered} /> : <Waiting />}
    </Card>
  );
}

function useOwnRequests(account: Address | undefined): OwnRequest[] | undefined {
  const market = MARAS_ADDRESS;
  const { data: count } = useReadContract({
    address: market ?? undefined,
    abi: marasAbi,
    functionName: "requestCount",
    query: { enabled: market !== null, refetchInterval: 10_000 },
  });

  const calls = useMemo(() => {
    const total = count === undefined ? 0 : Number(count);
    return Array.from({ length: total }, (_, index) => ({
      address: market ?? undefined,
      abi: marasAbi,
      functionName: "getRequest" as const,
      args: [BigInt(index)] as const,
    }));
  }, [count, market]);

  const { data: records } = useReadContracts({
    contracts: calls,
    query: { enabled: calls.length > 0, refetchInterval: 10_000 },
  });

  return useMemo(() => {
    if (count === undefined || account === undefined) return undefined;
    if (calls.length > 0 && records === undefined) return undefined;

    const mine: OwnRequest[] = [];
    (records ?? []).forEach((entry, index) => {
      if (entry.status !== "success") return;
      const record = entry.result as unknown as RequestRecord;
      if (record.buyer.toLowerCase() !== account.toLowerCase()) return;
      mine.push({ id: BigInt(index), record });
    });
    return mine.reverse();
  }, [count, calls.length, records, account]);
}

/** Which address each filled request delivered, read from the logs since the record omits it. */
function useDeliveredAddresses(needed: boolean): Map<string, Address> {
  const client = usePublicClient();
  const { data } = useQuery({
    queryKey: ["request-deliveries"],
    queryFn: () => (client === undefined ? Promise.resolve([]) : findDeliveries(client)),
    enabled: needed && client !== undefined,
  });

  return useMemo(() => {
    const byRequest = new Map<string, Address>();
    for (const delivery of data ?? []) {
      if (delivery.source === "request") byRequest.set(delivery.id.toString(), delivery.address);
    }
    return byRequest;
  }, [data]);
}

function Empty() {
  const [requesting, setRequesting] = useState(false);

  return (
    <Card className="flex max-w-md flex-col items-start gap-4 p-5">
      <p className="text-sm text-text-muted">
        Ask for an address nobody has mined yet. Your bounty stays escrowed until a miner delivers
        one that matches.
      </p>
      <Button onClick={() => setRequesting(true)}>Request an address</Button>
      {requesting && <RequestDialog onClose={() => setRequesting(false)} />}
    </Card>
  );
}

export function MyRequests() {
  const { address: account } = useAccount();
  const requests = useOwnRequests(account);
  const delivered = useDeliveredAddresses(requests?.some((entry) => entry.record.filled) ?? false);

  if (requests === undefined) {
    return <div className="h-40 max-w-md animate-pulse rounded-[var(--radius-card)] bg-surface-sunken" />;
  }
  if (requests.length === 0) return <Empty />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {requests.map((entry) => (
        <RequestCard
          key={entry.id.toString()}
          id={entry.id}
          record={entry.record}
          delivered={delivered.get(entry.id.toString())}
        />
      ))}
    </div>
  );
}
