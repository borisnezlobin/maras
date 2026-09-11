"use client";

import { CheckCircle, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { parseEther, type Address, type Hex } from "viem";
import { useAccount } from "wagmi";

import { ConnectGate } from "@/components/ConnectGate";
import { HookPicker } from "@/components/HookPicker";
import { Button, Field, Hint, IconButton, Input, TogglePill } from "@/components/ui";
import { maskFromFlags } from "@/lib/address";
import {
  describeCost,
  describeEffort,
  expandLoose,
  expectedAttempts,
  isPatternShape,
  padPatterns,
} from "@/lib/leet";
import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";
import { payloadInitCodeHash } from "@/lib/payload";
import { useTransaction } from "@/lib/useTransaction";

const ZERO_CHOICES = [0, 1, 2, 3, 4, 5, 6];
const ADDRESS_NIBBLES = 40;

type PostedSpec = ReturnType<typeof specFor>;

function spellingsFor(pattern: string): string[] {
  if (pattern !== "" && !isPatternShape(pattern)) return [];
  return expandLoose(pattern, true);
}

function nibblesOf(accepted: string[]): number {
  return accepted[0]?.length ?? 0;
}

function specFor(zeroBytes: number, hookMaskValue: number, hookBits: boolean, accepted: string[]) {
  return {
    minZeroBytes: zeroBytes,
    hookMask: hookMaskValue,
    checkHookMask: hookBits,
    patterns: padPatterns(accepted),
    patternCount: accepted.length,
    patternNibbles: nibblesOf(accepted),
  };
}

function attemptsFor(zeroBytes: number, hookBits: boolean, accepted: string[]): number {
  return expectedAttempts({
    minZeroBytes: zeroBytes,
    hookMask: hookBits ? 1 : undefined,
    patternNibbles: nibblesOf(accepted),
    variantCount: accepted.length,
  });
}

function bountyIsValid(value: string): boolean {
  const parsed = Number(value);
  return value !== "" && Number.isFinite(parsed) && parsed > 0;
}

function submitLabel(isPending: boolean, confirming: boolean): string {
  if (isPending) return "Confirm in your wallet";
  if (confirming) return "Posting…";
  return "Post bounty";
}

function Preview({ zeroBytes, spelling }: { zeroBytes: number; spelling: string }) {
  const zeros = "0".repeat(zeroBytes * 2);
  const fill = Math.max(0, ADDRESS_NIBBLES - zeros.length - spelling.length);
  // With nothing typed the two runs would meet at an empty span and read as a gap, so the
  // pattern only splits the fill once there is a pattern to show.
  const lead = spelling === "" ? fill : Math.floor(fill / 2);
  const trail = spelling === "" ? 0 : fill - lead;

  // Laid out inline rather than with flex: stretching the fill spans left a gap wherever the
  // dots did not happen to fill the space exactly.
  return (
    <div className="hex w-full overflow-hidden rounded-[var(--radius-control)] bg-inert px-3 py-2.5 text-sm text-ellipsis whitespace-nowrap">
      <span className="text-text-subtle">0x{zeros}</span>
      <span className="text-text-subtle">{"·".repeat(lead)}</span>
      {spelling !== "" && <span className="font-medium text-accent">{spelling}</span>}
      <span className="text-text-subtle">{"·".repeat(trail)}</span>
    </div>
  );
}

function ZeroBytePills({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ZERO_CHOICES.map((choice) => (
        <button
          key={choice}
          onClick={() => onChange(choice)}
          aria-pressed={choice === value}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            choice === value
              ? "bg-accent text-text-inverse"
              : "bg-inert text-text-muted hover:bg-inert-hover"
          }`}
        >
          {choice === 0 ? "None" : choice}
        </button>
      ))}
    </div>
  );
}

function SpellingPills({
  spellings,
  dropped,
  onToggle,
}: {
  spellings: string[];
  dropped: string[];
  onToggle: (spelling: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-text">Spellings you accept</span>
        <Hint text="A 3 can stand in for an e, a 4 for an a. Every extra spelling shortens the grind. Switch one off and it stops counting." />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {spellings.map((spelling) => (
          <TogglePill
            key={spelling}
            active={!dropped.includes(spelling)}
            label={`Accept the spelling ${spelling}`}
            onClick={() => onToggle(spelling)}
          >
            <span className="hex">{spelling}</span>
          </TogglePill>
        ))}
      </div>
    </div>
  );
}

function CostSummary({
  attempts,
  acceptedCount,
  spellingCount,
}: {
  attempts: number;
  acceptedCount: number;
  spellingCount: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-xs text-text-subtle">
        Costs a miner
        <Hint text="Time on one rented GPU at roughly $0.40 an hour. A bounty below this is not worth anyone's compute, so price it above." />
      </span>
      <span className="text-sm font-semibold text-text">
        {describeEffort(attempts)}
        <span className="font-normal text-text-muted"> · {describeCost(attempts)}</span>
      </span>
      {spellingCount > 1 && (
        <span className="text-xs text-text-muted">
          {acceptedCount} of {spellingCount} spellings
        </span>
      )}
    </div>
  );
}

function Posted({ hash, onClose }: { hash: Hex; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <CheckCircle size={44} weight="fill" className="text-accent" />
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-bold text-text">Bounty posted</h2>
        <p className="max-w-xs text-sm text-text-muted">
          Miners can see it now. It stays under your requested addresses until one delivers a
          match.
        </p>
      </div>
      <a
        className="hex text-xs text-text-muted underline hover:text-text"
        href={`https://sepolia.basescan.org/tx/${hash}`}
        target="_blank"
        rel="noreferrer"
      >
        {hash.slice(0, 18)}…
      </a>
      <Button onClick={onClose}>Done</Button>
    </div>
  );
}

function RequestForm({
  onClose,
  onSubmit,
  isPending,
  confirming,
}: {
  onClose: () => void;
  onSubmit: (spec: PostedSpec, bountyEth: string) => void;
  isPending: boolean;
  confirming: boolean;
}) {
  const [zeroBytes, setZeroBytes] = useState(3);
  const [pattern, setPattern] = useState("");
  const [hookFlags, setHookFlags] = useState<number[]>([]);
  const [bountyEth, setBountyEth] = useState("0.01");
  const [dropped, setDropped] = useState<string[]>([]);

  const allSpellings = useMemo(() => spellingsFor(pattern), [pattern]);
  const accepted = allSpellings.filter((spelling) => !dropped.includes(spelling));
  const hookBits = hookFlags.length > 0;
  const patternOk = pattern === "" || isPatternShape(pattern);
  const ready = patternOk && bountyIsValid(bountyEth) && !isPending && !confirming;
  const attempts = attemptsFor(zeroBytes, hookBits, accepted);

  function toggleFlag(bit: number) {
    setHookFlags((current) =>
      current.includes(bit) ? current.filter((item) => item !== bit) : [...current, bit],
    );
  }

  function toggleSpelling(spelling: string) {
    setDropped((current) =>
      current.includes(spelling)
        ? current.filter((item) => item !== spelling)
        : [...current, spelling],
    );
  }

  function changePattern(next: string) {
    setPattern(next.trim());
    setDropped([]);
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-text">Request an address</h2>
          <Hint text="Miners compete to find it. Your bounty is escrowed and only pays out when a matching address is delivered." />
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <Preview zeroBytes={zeroBytes} spelling={accepted[0] ?? ""} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">Zero bytes in front</span>
          <Hint text="A byte is two hex characters, so 2 bytes means the address starts 0x0000." />
        </div>
        <ZeroBytePills value={zeroBytes} onChange={setZeroBytes} />
      </div>

      <Field label="Must contain">
        <Input
          value={pattern}
          placeholder="cafe, deadbeef, b0b…"
          onChange={(event) => changePattern(event.target.value)}
        />
      </Field>

      {allSpellings.length > 1 && (
        <SpellingPills spellings={allSpellings} dropped={dropped} onToggle={toggleSpelling} />
      )}

      <HookPicker
        flags={hookFlags}
        onToggle={toggleFlag}
        onClear={() => setHookFlags([])}
        pillAction="Require"
        emptyLabel="Not required"
        countNoun="required"
        hint="A V4 hook declares its permissions through the low 14 bits of its own address, so the address has to be mined to match. Picking fewer does not make it easier: all fourteen bits are pinned either way."
      />

      <Field label="Bounty in ETH">
        <Input value={bountyEth} onChange={(event) => setBountyEth(event.target.value)} />
      </Field>

      <div className="flex items-center justify-between gap-4 border-t border-edge pt-4">
        <CostSummary
          attempts={attempts}
          acceptedCount={accepted.length}
          spellingCount={allSpellings.length}
        />
        <ConnectGate>
          <Button
            onClick={() => onSubmit(specFor(zeroBytes, maskFromFlags(hookFlags), hookBits, accepted), bountyEth)}
            disabled={!ready}
          >
            {submitLabel(isPending, confirming)}
          </Button>
        </ConnectGate>
      </div>

      {!patternOk && (
        <span className="text-sm text-accent-strong">
          Use up to eight characters from 0-9 and a-f.
        </span>
      )}
    </div>
  );
}

export function RequestDialog({ onClose }: { onClose: () => void }) {
  const { address: account } = useAccount();
  const { writeContract, state } = useTransaction();

  function submit(spec: PostedSpec, bountyEth: string) {
    writeContract({
      address: MARAS_ADDRESS as Address,
      abi: marasAbi,
      functionName: "postRequest",
      args: [spec, payloadInitCodeHash(account as Address)],
      value: parseEther(bountyEth),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-text/40 p-4 sm:items-center">
      <div className="flex w-full max-w-lg flex-col rounded-[var(--radius-card)] bg-surface-raised shadow-[var(--shadow-lift)]">
        {state.confirmed && state.hash !== undefined ? (
          <Posted hash={state.hash} onClose={onClose} />
        ) : (
          <RequestForm
            onClose={onClose}
            onSubmit={submit}
            isPending={state.signing}
            confirming={state.confirming}
          />
        )}
        {state.message !== null && !state.confirmed && (
          <p className="px-5 pb-5 text-sm text-accent-strong">{state.message}</p>
        )}
      </div>
    </div>
  );
}
