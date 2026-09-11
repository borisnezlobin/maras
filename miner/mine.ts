import { bytesToHex, type Address, type Hex } from "viem";

import { createDeriver, satisfiesSpec, type Spec } from "../shared/create3.js";

const SALT_LENGTH = 32;
const COUNTER_LENGTH = 8;
const COUNTER_OFFSET = SALT_LENGTH - COUNTER_LENGTH;
const PROGRESS_INTERVAL = 50_000;

export interface MineResult {
  salt: Hex;
  address: Address;
  attempts: number;
  seconds: number;
}

/**
 * Expected attempts for a spec, so callers can warn before starting a grind that
 * would take days. Each constrained bit doubles the work.
 */
export function expectedAttempts(spec: Spec): number {
  let bits = spec.minZeroBytes * 8;
  if (spec.hookMask !== undefined) bits += 14;
  if (spec.pattern !== undefined) bits += 32;
  return 2 ** bits;
}

function randomSaltBuffer(): Uint8Array {
  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt.subarray(0, COUNTER_OFFSET));
  return salt;
}

function writeCounter(salt: Uint8Array, counter: bigint): void {
  let remaining = counter;
  for (let index = SALT_LENGTH - 1; index >= COUNTER_OFFSET; index--) {
    salt[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
}

/**
 * Grinds salts until one derives an address satisfying `spec`. Only the trailing counter
 * bytes are rewritten per attempt, so the hash inputs stay in a single preallocated buffer.
 */
export function mineSalt(
  deployer: Address,
  spec: Spec,
  onProgress?: (attempts: number) => void,
): MineResult {
  const derive = createDeriver(deployer);
  const salt = randomSaltBuffer();
  const startedAt = Date.now();

  for (let counter = 0n; ; counter++) {
    writeCounter(salt, counter);
    const address = derive(salt);

    if (satisfiesSpec(address, spec)) {
      const attempts = Number(counter) + 1;
      return {
        salt: bytesToHex(salt),
        address: bytesToHex(address) as Address,
        attempts,
        seconds: (Date.now() - startedAt) / 1000,
      };
    }

    if (onProgress !== undefined && counter > 0n && counter % BigInt(PROGRESS_INTERVAL) === 0n) {
      onProgress(Number(counter));
    }
  }
}
