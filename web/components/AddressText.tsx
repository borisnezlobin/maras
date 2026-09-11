import { findNibbleRun, leadingZeroBytes } from "@/lib/address";

type Kind = "zero" | "word" | "plain";

interface Segment {
  text: string;
  kind: Kind;
}

/**
 * Splits the hex body so the parts worth paying for stand out from the parts that are just
 * hash: the leading zero run and whichever declared word the address contains.
 */
function segments(address: string, words: string[]): Segment[] {
  const body = address.slice(2);
  const zeroChars = leadingZeroBytes(address) * 2;
  const match = findNibbleRun(address, words);

  const pieces: Segment[] = [];
  if (zeroChars > 0) pieces.push({ text: body.slice(0, zeroChars), kind: "zero" });

  const rest = body.slice(zeroChars);
  if (match === null || match.start < zeroChars) {
    if (rest.length > 0) pieces.push({ text: rest, kind: "plain" });
    return pieces;
  }

  const start = match.start - zeroChars;
  if (start > 0) pieces.push({ text: rest.slice(0, start), kind: "plain" });
  pieces.push({ text: rest.slice(start, start + match.length), kind: "word" });

  const tail = rest.slice(start + match.length);
  if (tail.length > 0) pieces.push({ text: tail, kind: "plain" });
  return pieces;
}

const STYLES: Record<Kind, string> = {
  zero: "text-text font-medium",
  word: "text-accent font-medium",
  plain: "text-text-subtle",
};

export function AddressText({
  address,
  words = [],
  className = "",
}: {
  address: string;
  words?: string[];
  className?: string;
}) {
  return (
    <span className={`hex break-all ${className}`}>
      <span className="text-text-subtle">0x</span>
      {segments(address, words).map((segment, index) => (
        <span key={index} className={STYLES[segment.kind]}>
          {segment.text}
        </span>
      ))}
    </span>
  );
}
