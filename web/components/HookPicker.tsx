"use client";

import { CaretRight } from "@phosphor-icons/react";
import { useState } from "react";

import { Hint, TogglePill } from "@/components/ui";
import { HOOK_FLAGS } from "@/lib/address";

/**
 * Fourteen permissions is too many to leave open, so they sit behind a disclosure with the count
 * as the cue that something is set. Shared between requesting an address, where the permissions
 * are what gets mined, and browsing, where they narrow what is already for sale.
 */
export function HookPicker({
  flags,
  onToggle,
  onClear,
  hint,
  emptyLabel,
  countNoun,
  pillAction,
}: {
  flags: number[];
  onToggle: (bit: number) => void;
  onClear: () => void;
  hint: string;
  emptyLabel: string;
  countNoun: string;
  pillAction: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = flags.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-[var(--radius-control)] text-sm font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <CaretRight
            size={12}
            weight="bold"
            aria-hidden="true"
            className={`text-text-muted transition-transform ${open ? "rotate-90" : ""}`}
          />
          Uniswap V4 hook permissions
        </button>
        <Hint text={hint} />
        <span className="ms-auto text-xs text-text-muted">
          {chosen ? `${flags.length} ${countNoun}` : emptyLabel}
        </span>
        {chosen && (
          <button
            onClick={onClear}
            className="rounded-[var(--radius-control)] text-xs text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
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
              label={`${pillAction} ${name}`}
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
