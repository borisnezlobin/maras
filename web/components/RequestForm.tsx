"use client";

import { CircleNotch, Coins } from "@phosphor-icons/react";
import { useState } from "react";
import { parseEther, type Address, type Hex } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { Button, Card, Field, Input } from "@/components/ui";
import { describeEffort, expectedAttempts } from "@/lib/address";
import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";
import { vaultInitCodeHash } from "@/lib/payload";

const PATTERN_SHAPE = /^[0-9a-fA-F]{8}$/;
const NO_PATTERN: Hex = "0x00000000";

interface Draft {
  minZeroBytes: number;
  pattern: string;
  bountyEth: string;
}

function patternIsValid(pattern: string): boolean {
  return pattern === "" || PATTERN_SHAPE.test(pattern);
}

function bountyIsValid(bountyEth: string): boolean {
  const parsed = Number(bountyEth);
  return bountyEth !== "" && Number.isFinite(parsed) && parsed > 0;
}

function specFrom(draft: Draft) {
  return {
    minZeroBytes: draft.minZeroBytes,
    hookMask: 0,
    checkHookMask: false,
    pattern: (draft.pattern === "" ? NO_PATTERN : `0x${draft.pattern}`) as Hex,
    checkPattern: draft.pattern !== "",
  };
}

function Problems({ draft, connected }: { draft: Draft; connected: boolean }) {
  if (!patternIsValid(draft.pattern)) {
    return (
      <p className="text-sm text-accent-strong">
        The pattern needs to be exactly eight hex characters, with no leading 0x.
      </p>
    );
  }
  if (!bountyIsValid(draft.bountyEth)) {
    return <p className="text-sm text-accent-strong">The bounty has to be more than zero.</p>;
  }
  if (!connected) {
    return <p className="text-sm text-text-subtle">Connect a wallet to post a request.</p>;
  }
  return null;
}

export function RequestForm() {
  const { address: account } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const market = MARAS_ADDRESS;

  const [draft, setDraft] = useState<Draft>({ minZeroBytes: 3, pattern: "", bountyEth: "0.01" });

  const { data: openRequests } = useReadContract({
    address: market ?? undefined,
    abi: marasAbi,
    functionName: "requestCount",
    query: { enabled: market !== null, refetchInterval: 5_000 },
  });

  if (market === null) return null;

  const connected = account !== undefined;
  const ready =
    connected && patternIsValid(draft.pattern) && bountyIsValid(draft.bountyEth) && !isPending;
  const effort = describeEffort(expectedAttempts(draft.minZeroBytes, false, draft.pattern !== ""));

  function submit() {
    writeContract({
      address: market as Address,
      abi: marasAbi,
      functionName: "postRequest",
      args: [specFrom(draft), vaultInitCodeHash(account as Address)],
      value: parseEther(draft.bountyEth),
    });
  }

  return (
    <section className="flex flex-col gap-4 px-6 sm:px-10">
      <h2 className="text-lg font-medium text-text">Ask for an address nobody has mined</h2>
      <p className="max-w-2xl text-sm text-text-muted">
        Describe the address you want and lock up a bounty. Miners compete to find it, and the first
        valid salt wins. Your contract is bound by hash when you post, so a miner cannot deploy
        something of their own at the address and take the bounty — they mine without ever learning
        what will be deployed.
      </p>

      <Card className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Leading zero bytes" hint="Each one costs 256x more compute.">
            <Input
              type="number"
              min={0}
              max={12}
              value={draft.minZeroBytes}
              onChange={(event) =>
                setDraft({ ...draft, minZeroBytes: Number(event.target.value) })
              }
            />
          </Field>

          <Field label="Must contain" hint="Four bytes of hex, like deadbeef. Leave empty to skip.">
            <Input
              value={draft.pattern}
              placeholder="deadbeef"
              onChange={(event) => setDraft({ ...draft, pattern: event.target.value.trim() })}
            />
          </Field>

          <Field label="Bounty in ETH" hint="Released only when a valid salt is delivered.">
            <Input
              value={draft.bountyEth}
              onChange={(event) => setDraft({ ...draft, bountyEth: event.target.value })}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-edge pt-4">
          <p className="text-sm text-text-muted">
            A miner should expect {effort}.
            {openRequests !== undefined && Number(openRequests) > 0
              ? ` ${Number(openRequests)} posted so far.`
              : ""}
          </p>
          <Button onClick={submit} disabled={!ready}>
            {isPending ? <CircleNotch size={16} className="animate-spin" /> : <Coins size={16} />}
            Post bounty and escrow it
          </Button>
        </div>

        <Problems draft={draft} connected={connected} />
      </Card>
    </section>
  );
}
