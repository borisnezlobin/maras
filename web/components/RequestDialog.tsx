"use client";

import { Coins, X } from "@phosphor-icons/react";
import { useState } from "react";
import { parseEther, type Address, type Hex } from "viem";
import { useAccount, useWriteContract } from "wagmi";

import { ConnectGate } from "@/components/ConnectGate";
import { Button, Field, Input } from "@/components/ui";
import {
  describeEffort,
  expandLoose,
  expectedAttempts,
  hasLookalikes,
  isPatternShape,
  padPatterns,
} from "@/lib/leet";
import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";
import { vaultInitCodeHash } from "@/lib/payload";

const ZERO_CHOICES = [0, 1, 2, 3, 4, 5, 6];

interface Draft {
  minZeroBytes: number;
  pattern: string;
  loose: boolean;
  hookBits: boolean;
  bountyEth: string;
}

const EMPTY: Draft = {
  minZeroBytes: 3,
  pattern: "",
  loose: true,
  hookBits: false,
  bountyEth: "0.01",
};

function variantsOf(draft: Draft): string[] {
  return isPatternShape(draft.pattern) ? expandLoose(draft.pattern, draft.loose) : [];
}

/** What the address will look like: zero wells, then the pattern floating somewhere after. */
function Preview({ draft, variants }: { draft: Draft; variants: string[] }) {
  const zeros = "00".repeat(draft.minZeroBytes);
  const shown = variants[0] ?? "";
  const tail = 40 - zeros.length - shown.length;

  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--radius-control)] bg-surface-sunken p-3">
      <span className="hex flex w-full items-baseline overflow-hidden text-sm whitespace-nowrap">
        <span className="shrink-0 text-text-subtle">0x{zeros}</span>
        <span className="min-w-0 flex-1 overflow-hidden text-text-subtle">
          {"·".repeat(Math.max(0, Math.floor(tail / 2)))}
        </span>
        <span className="shrink-0 font-medium text-accent-strong">{shown}</span>
        <span className="min-w-0 flex-1 overflow-hidden text-text-subtle">
          {"·".repeat(Math.max(0, Math.ceil(tail / 2)))}
        </span>
      </span>
      {variants.length > 1 && (
        <span className="text-xs text-text-muted">
          {variants.length} spellings accepted: {variants.slice(0, 6).join(", ")}
          {variants.length > 6 ? "…" : ""}
        </span>
      )}
    </div>
  );
}

function bountyIsValid(value: string): boolean {
  const parsed = Number(value);
  return value !== "" && Number.isFinite(parsed) && parsed > 0;
}

export function RequestDialog({ onClose }: { onClose: () => void }) {
  const { address: account } = useAccount();
  const { writeContract, isPending } = useWriteContract();
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const patternOk = draft.pattern === "" || isPatternShape(draft.pattern);
  const variants = variantsOf(draft);
  const attempts = expectedAttempts({
    minZeroBytes: draft.minZeroBytes,
    hookMask: draft.hookBits ? 0x2400 : undefined,
    patternNibbles: variants[0]?.length ?? 0,
    variantCount: variants.length,
  });

  const ready = patternOk && bountyIsValid(draft.bountyEth) && !isPending;

  function submit() {
    writeContract({
      address: MARAS_ADDRESS as Address,
      abi: marasAbi,
      functionName: "postRequest",
      args: [
        {
          minZeroBytes: draft.minZeroBytes,
          hookMask: draft.hookBits ? 0x2400 : 0,
          checkHookMask: draft.hookBits,
          patterns: padPatterns(variants),
          patternCount: variants.length,
          patternNibbles: variants[0]?.length ?? 0,
        },
        vaultInitCodeHash(account as Address),
      ],
      value: parseEther(draft.bountyEth),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-text/40 p-4 sm:items-center">
      <div className="flex w-full max-w-lg flex-col gap-5 rounded-[var(--radius-card)] bg-surface-raised p-5 shadow-[var(--shadow-lift)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-bold text-text">Request an address</h2>
            <span className="text-sm text-text-muted">Miners race to find it. You pay on delivery.</span>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-text-subtle hover:bg-surface-sunken hover:text-text">
            <X size={18} />
          </button>
        </div>

        <Preview draft={draft} variants={variants} />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-text">Leading zeros</span>
          <div className="flex flex-wrap gap-1.5">
            {ZERO_CHOICES.map((value) => (
              <button
                key={value}
                onClick={() => setDraft({ ...draft, minZeroBytes: value })}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  draft.minZeroBytes === value
                    ? "bg-control text-text-inverse"
                    : "bg-surface-sunken text-text-muted hover:bg-edge-strong"
                }`}
              >
                {value === 0 ? "None" : value}
              </button>
            ))}
          </div>
        </div>

        <Field label="Must contain">
          <Input
            value={draft.pattern}
            placeholder="cafe, deadbee, b0b…"
            onChange={(event) => setDraft({ ...draft, pattern: event.target.value.trim() })}
          />
        </Field>

        {hasLookalikes(draft.pattern) && (
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={draft.loose}
              onChange={(event) => setDraft({ ...draft, loose: event.target.checked })}
              className="size-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-text">
              Accept lookalikes, so a 3 counts as an e and a 4 as an a
            </span>
          </label>
        )}

        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={draft.hookBits}
            onChange={(event) => setDraft({ ...draft, hookBits: event.target.checked })}
            className="size-4 accent-[var(--accent)]"
          />
          <span className="text-sm text-text">Uniswap V4 hook permission bits</span>
        </label>

        <Field label="Bounty in ETH">
          <Input
            value={draft.bountyEth}
            onChange={(event) => setDraft({ ...draft, bountyEth: event.target.value })}
          />
        </Field>

        <div className="flex items-center justify-between gap-4 border-t border-edge pt-4">
          <div className="flex flex-col">
            <span className="text-xs text-text-subtle">Mining time</span>
            <span className="text-sm font-semibold text-text">{describeEffort(attempts)}</span>
          </div>
          <ConnectGate>
            <Button onClick={submit} disabled={!ready}>
              <Coins size={16} />
              Post bounty
            </Button>
          </ConnectGate>
        </div>

        {!patternOk && (
          <span className="text-sm text-accent-strong">
            Use up to eight characters from 0-9 and a-f.
          </span>
        )}
      </div>
    </div>
  );
}
