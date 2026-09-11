import { findNibbleRun, leadingZeroBytes } from "@/lib/address";

type TileKind = "zero" | "word" | "plain";

const COLUMNS = 5;
const ROWS = 4;
const TILE = 18;
const GAP = 4;
const RADIUS = 4;

const WIDTH = COLUMNS * TILE + (COLUMNS - 1) * GAP;
const HEIGHT = ROWS * TILE + (ROWS - 1) * GAP;

const FILL: Record<TileKind, string> = {
  zero: "var(--tile-zero)",
  word: "var(--tile-pattern)",
  plain: "var(--tile-plain)",
};

interface AddressTilesProps {
  address: string;
  /** Words the seller declared and the contract verified. */
  words?: string[];
  scale?: number;
}

/** A match can start mid-byte, so every byte the run touches is lit. */
function byteKinds(address: string, words: string[]): TileKind[] {
  const zeros = leadingZeroBytes(address);
  const match = findNibbleRun(address, words);
  const firstByte = match === null ? -1 : Math.floor(match.start / 2);
  const lastByte = match === null ? -1 : Math.floor((match.start + match.length - 1) / 2);

  return Array.from({ length: 20 }, (_, index) => {
    if (match !== null && index >= firstByte && index <= lastByte) return "word";
    if (index < zeros) return "zero";
    return "plain";
  });
}

export function AddressTiles({ address, words = [], scale = 1 }: AddressTilesProps) {
  const kinds = byteKinds(address, words);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH * scale}
      height={HEIGHT * scale}
      role="img"
      aria-label={`${leadingZeroBytes(address)} leading zero bytes`}
    >
      {kinds.map((kind, index) => {
        const column = index % COLUMNS;
        const row = Math.floor(index / COLUMNS);
        return (
          <rect
            key={index}
            x={column * (TILE + GAP)}
            y={row * (TILE + GAP)}
            width={TILE}
            height={TILE}
            rx={RADIUS}
            fill={FILL[kind]}
            stroke={kind === "zero" ? "var(--tile-zero-edge)" : "none"}
            strokeWidth={kind === "zero" ? 1 : 0}
          />
        );
      })}
    </svg>
  );
}
