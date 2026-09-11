import { findPattern, leadingZeroBytes } from "@/lib/address";

interface AddressHexProps {
  address: string;
  pattern?: string;
  size?: "sm" | "lg";
}

interface Segment {
  text: string;
  kind: "plain" | "zeros" | "pattern";
}

/**
 * Splits the hex body so the parts that made the address valuable can be shown rather than
 * described: the leading zero run and the matched pattern each get their own mark.
 */
function segments(address: string, pattern?: string): Segment[] {
  const body = address.slice(2);
  const zeroChars = leadingZeroBytes(address) * 2;
  const match = pattern === undefined ? null : findPattern(address, pattern);

  const cuts: Segment[] = [];
  if (zeroChars > 0) cuts.push({ text: body.slice(0, zeroChars), kind: "zeros" });

  const rest = body.slice(zeroChars);
  if (match === null || match.start < zeroChars) {
    if (rest.length > 0) cuts.push({ text: rest, kind: "plain" });
    return cuts;
  }

  const relativeStart = match.start - zeroChars;
  if (relativeStart > 0) cuts.push({ text: rest.slice(0, relativeStart), kind: "plain" });
  cuts.push({ text: rest.slice(relativeStart, relativeStart + match.length), kind: "pattern" });
  const tail = rest.slice(relativeStart + match.length);
  if (tail.length > 0) cuts.push({ text: tail, kind: "plain" });

  return cuts;
}

const KIND_STYLES: Record<Segment["kind"], string> = {
  plain: "text-text",
  zeros: "text-text-subtle",
  pattern: "text-accent-strong font-medium",
};

export function AddressHex({ address, pattern, size = "sm" }: AddressHexProps) {
  const textSize = size === "lg" ? "text-lg sm:text-xl" : "text-sm";

  return (
    <span className={`hex ${textSize} break-all`}>
      <span className="text-text-subtle">0x</span>
      {segments(address, pattern).map((segment, index) => (
        <span key={index} className={KIND_STYLES[segment.kind]}>
          {segment.text}
        </span>
      ))}
    </span>
  );
}
