"use client";

import { CaretRight, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { parseEther, type Address } from "viem";
import { useAccount, useWriteContract } from "wagmi";

import { ConnectGate } from "@/components/ConnectGate";
import { Button, Field, Hint, IconButton, Input, TogglePill } from "@/components/ui";
import { HOOK_FLAGS } from "@/lib/address";
import {
  describeCost,
  describeEffort,
  expandLoose,
  expectedAttempts,
  isPatternShape,
  padPatterns,
} from "@/lib/leet";
import { MARAS_ADDRESS, marasAbi } from "@/lib/maras.generated";
import { vaultInitCodeHash } from "@/lib/payload";

const ZERO_CHOICES = [0, 1, 2, 3, 4, 5, 6];
const ADDRESS_NIBBLES = 40;

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
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
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

/**
 * V4 requires the low 14 bits of the address to equal the hook's permission set exactly, so
 * picking fewer permissions does not make the grind shorter — all fourteen bits are pinned
 * either way.
 */
function HookPicker({
  flags,
  onToggle,
  onClear,
}: {
  flags: number[];
  onToggle: (bit: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const enabled = flags.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-sm font-semibold text-text"
        >
          <CaretRight
            size={12}
            weight="bold"
            className={`text-text-muted transition-transform ${open ? "rotate-90" : ""}`}
          />
          Uniswap V4 hook permissions
        </button>
        <Hint text="A V4 hook declares its permissions through the low 14 bits of its own address, so the address has to be mined to match. Picking fewer does not make it easier: all fourteen bits are pinned either way." />
        <span className="ml-auto text-xs text-text-muted">
          {enabled ? `${flags.length} required` : "Not required"}
        </span>
        {enabled && (
          <button onClick={onClear} className="text-xs text-text-muted hover:text-text">
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-wrap gap-1.5">
          {HOOK_FLAGS.map(([bit, name]) => (
            <TogglePill
              key={bit}
              active={flags.includes(bit)}
              tone="opt-in"
              label={`Require ${name}`}
              onClick={() => onToggle(bit)}
            >
              {name}
            </TogglePill>
          ))}
        </div>
      )}
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

export function RequestDialog({ onClose }: { onClose: () => void }) {
  const { address: account } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const [zeroBytes, setZeroBytes] = useState(3);
  const [pattern, setPattern] = useState("");
  const [hookFlags, setHookFlags] = useState<number[]>([]);
  const [bountyEth, setBountyEth] = useState("0.01");
  const [dropped, setDropped] = useState<string[]>([]);

  const hookBits = hookFlags.length > 0;
  const hookMaskValue = hookFlags.reduce((mask, bit) => mask | (1 << bit), 0);

  function toggleFlag(bit: number) {
    setHookFlags((current) =>
      current.includes(bit) ? current.filter((item) => item !== bit) : [...current, bit],
    );
  }

  const allSpellings = useMemo(() => spellingsFor(pattern), [pattern]);
  const accepted = allSpellings.filter((spelling) => !dropped.includes(spelling));
  const patternOk = pattern === "" || isPatternShape(pattern);
  const ready = patternOk && bountyIsValid(bountyEth) && !isPending;
  const attempts = attemptsFor(zeroBytes, hookBits, accepted);

  function toggle(spelling: string) {
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

  function submit() {
    writeContract({
      address: MARAS_ADDRESS as Address,
      abi: marasAbi,
      functionName: "postRequest",
      args: [
        specFor(zeroBytes, hookMaskValue, hookBits, accepted),
        vaultInitCodeHash(account as Address),
      ],
      value: parseEther(bountyEth),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-text/40 p-4 sm:items-center">
      <div className="flex w-full max-w-lg flex-col gap-5 rounded-[var(--radius-card)] bg-surface-raised p-5 shadow-[var(--shadow-lift)]">
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
          <SpellingPills spellings={allSpellings} dropped={dropped} onToggle={toggle} />
        )}

        <HookPicker flags={hookFlags} onToggle={toggleFlag} onClear={() => setHookFlags([])} />

        <Field label="Bounty in ETH">
          <Input value={bountyEth} onChange={(event) => setBountyEth(event.target.value)} />
        </Field>

        <div className="flex items-center justify-between gap-4 border-t border-edge pt-4">
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-xs text-text-subtle">
              Costs a miner
              <Hint text="Time on one rented GPU at roughly $0.40 an hour. A bounty below this is not worth anyone's compute, so price it above." />
            </span>
            <span className="text-sm font-semibold text-text">
              {describeEffort(attempts)}
              <span className="font-normal text-text-muted"> · {describeCost(attempts)}</span>
            </span>
            {allSpellings.length > 1 && (
              <span className="text-xs text-text-muted">
                {accepted.length} of {allSpellings.length} spellings
              </span>
            )}
          </div>
          <ConnectGate>
            <Button onClick={submit} disabled={!ready}>
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
