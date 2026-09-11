import { bytesToHex, type Address, type Hex } from "viem";

import { compileSpec, createDeriver, type Spec } from "../shared/create3.js";

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

const CALIBRATION_MS = 250;
const CALIBRATION_BATCH = 2_000;

/**
 * Measures how fast this machine actually derives addresses. A quoted rate from some other
 * machine makes the estimate worse than no estimate at all.
 */
export function measureRate(deployer: Address): number {
  const derive = createDeriver(deployer);
  const salt = new Uint8Array(SALT_LENGTH);
  const startedAt = Date.now();
  let tried = 0;

  while (Date.now() - startedAt < CALIBRATION_MS) {
    for (let index = 0; index < CALIBRATION_BATCH; index++) {
      writeCounter(salt, BigInt(tried + index));
      derive(salt);
    }
    tried += CALIBRATION_BATCH;
  }

  return tried / ((Date.now() - startedAt) / 1000);
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
 * Grinds salts until one derives an address satisfying `spec`. Only the trailing counter bytes
 * are rewritten per attempt, and the spec is compiled once, so the loop allocates nothing.
 */
export function mineSalt(
  deployer: Address,
  spec: Spec,
  onProgress?: (attempts: number) => void,
): MineResult {
  const derive = createDeriver(deployer);
  const matches = compileSpec(spec);
  const salt = randomSaltBuffer();
  const startedAt = Date.now();

  for (let counter = 0n; ; counter++) {
    writeCounter(salt, counter);
    const address = derive(salt);

    if (matches(address)) {
      return {
        salt: bytesToHex(salt),
        address: bytesToHex(address) as Address,
        attempts: Number(counter) + 1,
        seconds: (Date.now() - startedAt) / 1000,
      };
    }

    if (onProgress !== undefined && counter > 0n && counter % BigInt(PROGRESS_INTERVAL) === 0n) {
      onProgress(Number(counter));
    }
  }
}
