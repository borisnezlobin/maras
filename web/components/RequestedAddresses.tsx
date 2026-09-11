"use client";

import { Hourglass } from "@phosphor-icons/react";
import { useMemo } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { Badge, Card, Hint } from "@/components/ui";
import { formatEth, HOOK_FLAGS } from "@/lib/address";
import { declaredWords, type OnChainSpec } from "@/lib/listing";
import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";

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

function RequestCard({ id, record }: OwnRequest) {
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
        {words.length > 0 && <Badge tone="accent">{words[0]}</Badge>}
        {permissions.length > 0 && <Badge>{permissions.length} V4</Badge>}
        {permissions.length > 0 && (
          <Hint text={`Must carry exactly: ${permissions.join(", ")}.`} />
        )}
      </div>

      <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
        <Hourglass size={16} className="text-text-subtle" />
        Waiting for a miner
      </span>
    </Card>
  );
}

/**
 * A bounty is escrowed the moment it is posted and the contract has no way to take it back, so
 * this is the only place a buyer can see where their money went.
 */
export function RequestedAddresses() {
  const { address: account } = useAccount();
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

  const mine = useMemo(() => {
    if (records === undefined || account === undefined) return [];

    const found: OwnRequest[] = [];
    records.forEach((entry, index) => {
      if (entry.status !== "success") return;
      const record = entry.result as unknown as RequestRecord;
      if (record.buyer.toLowerCase() !== account.toLowerCase()) return;
      // A filled request has become an address, which is listed with the others the buyer owns.
      if (record.filled) return;
      found.push({ id: BigInt(index), record });
    });

    return found.reverse();
  }, [records, account]);

  if (mine.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-bold text-text">Your requested addresses</h2>
        <span className="text-sm text-text-muted">
          Escrowed until a miner delivers one that matches
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {mine.map((entry) => (
          <RequestCard key={entry.id.toString()} id={entry.id} record={entry.record} />
        ))}
      </div>
    </section>
  );
}
