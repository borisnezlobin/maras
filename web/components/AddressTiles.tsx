import { findNibbleRun, leadingZeroBytes } from "@/lib/address";

type TileKind = "zero" | "pattern" | "plain";

const COLUMNS = 5;
const ROWS = 4;
const TILE = 18;
const GAP = 4;
const RADIUS = 4;

const WIDTH = COLUMNS * TILE + (COLUMNS - 1) * GAP;
const HEIGHT = ROWS * TILE + (ROWS - 1) * GAP;

const FILL: Record<TileKind, string> = {
  zero: "var(--tile-zero)",
  pattern: "var(--tile-pattern)",
  plain: "var(--tile-plain)",
};

interface AddressTilesProps {
  address: string;
  patterns?: string[];
  scale?: number;
}

/**
 * A match can start mid-byte, so every byte the run touches is lit. With nothing searched for,
 * common words are still highlighted: an address was usually mined for one, and a card that
 * cannot show why it is worth buying is not selling anything.
 */
function byteKinds(address: string, patterns: string[]): TileKind[] {
  const zeros = leadingZeroBytes(address);
  const match = findNibbleRun(address, patterns);
  const firstByte = match === null ? -1 : Math.floor(match.start / 2);
  const lastByte = match === null ? -1 : Math.floor((match.start + match.length - 1) / 2);

  return Array.from({ length: 20 }, (_, index) => {
    if (index >= firstByte && index <= lastByte && match !== null) return "pattern";
    if (index < zeros) return "zero";
    return "plain";
  });
}

/** Words worth pointing at when the viewer has not searched for anything specific. */
const COMMON_WORDS = [
  "deadbeef",
  "deadbee",
  "cafebabe",
  "facade",
  "beef",
  "cafe",
  "face",
  "feed",
  "babe",
  "dead",
  "b0b",
];

function highlightFor(address: string, patterns: string[]): string[] {
  if (patterns.length > 0) return patterns;
  const body = address.slice(2).toLowerCase();
  const found = COMMON_WORDS.find((word) => body.includes(word));
  return found === undefined ? [] : [found];
}

export function AddressTiles({ address, patterns = [], scale = 1 }: AddressTilesProps) {
  const kinds = byteKinds(address, highlightFor(address, patterns));

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
