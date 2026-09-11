"use client";

const MAX = 6;

/**
 * Difficulty climbs 256x per byte, so the ticks are labelled with the byte count and the track
 * itself carries the shape of what you are asking for.
 */
export function ZeroBytesSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2 text-sm text-text-muted">
        Leading zero bytes
        <span className="hex text-xs text-text">
          {value === 0 ? "any" : `0x${"00".repeat(value)}…`}
        </span>
      </span>

      <input
        type="range"
        min={0}
        max={MAX}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="Fewest leading zero bytes"
        className="h-1.5 w-56 cursor-pointer appearance-none rounded-full bg-inert-edge accent-[var(--accent)]"
      />

      <span className="flex w-56 justify-between text-[11px] text-text-subtle">
        {Array.from({ length: MAX + 1 }, (_, tick) => (
          <span key={tick} className={tick === value ? "font-semibold text-accent" : ""}>
            {tick === 0 ? "any" : tick}
          </span>
        ))}
      </span>
    </label>
  );
}
