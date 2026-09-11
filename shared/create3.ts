import { keccak256, hexToBytes, bytesToHex, type Address, type Hex } from 'viem'

export const PROXY_INITCODE: Hex = '0x67363d3d37363d34f03d5260086018f3'
export const PROXY_INITCODE_HASH: Hex =
  '0x21c35dbe1b344a2488cf3321d6ce542f8e9f305544ff09e4993a62319a497c1f'

const PROXY_INPUT_LENGTH = 85
const DEPLOYER_OFFSET = 1
const SALT_OFFSET = 21
const INITCODE_HASH_OFFSET = 53

const FINAL_INPUT_LENGTH = 23
const PROXY_ADDRESS_OFFSET = 2

const ADDRESS_LENGTH = 20
const HASH_ADDRESS_START = 12

const HOOK_PERMISSION_MASK = 0x3fffn

function addressFromHash(hash: Uint8Array): Uint8Array {
  return hash.slice(HASH_ADDRESS_START, HASH_ADDRESS_START + ADDRESS_LENGTH)
}

/**
 * Preallocates both hash inputs so a mining loop only rewrites the 32 salt bytes.
 * Mirrors Solady's CREATE3: a fixed proxy is CREATE2-deployed, then deploys at nonce 1.
 */
export function createDeriver(deployer: Address) {
  const proxyInput = new Uint8Array(PROXY_INPUT_LENGTH)
  proxyInput[0] = 0xff
  proxyInput.set(hexToBytes(deployer), DEPLOYER_OFFSET)
  proxyInput.set(hexToBytes(PROXY_INITCODE_HASH), INITCODE_HASH_OFFSET)

  const finalInput = new Uint8Array(FINAL_INPUT_LENGTH)
  finalInput[0] = 0xd6
  finalInput[1] = 0x94
  finalInput[FINAL_INPUT_LENGTH - 1] = 0x01

  return function derive(salt: Uint8Array): Uint8Array {
    proxyInput.set(salt, SALT_OFFSET)
    const proxy = addressFromHash(keccak256(proxyInput, 'bytes'))
    finalInput.set(proxy, PROXY_ADDRESS_OFFSET)
    return addressFromHash(keccak256(finalInput, 'bytes'))
  }
}

export function predictAddress(deployer: Address, salt: Hex): Address {
  const derived = createDeriver(deployer)(hexToBytes(salt))
  return bytesToHex(derived) as Address
}

export function leadingZeroBytes(address: Uint8Array): number {
  let count = 0
  while (count < address.length && address[count] === 0) count++
  return count
}

export function matchesHookMask(address: Uint8Array, mask: number): boolean {
  const low = BigInt(bytesToHex(address)) & HOOK_PERMISSION_MASK
  return low === BigInt(mask)
}

export const ADDRESS_NIBBLES = 40

/** Splits an address into nibbles, reusing `out` so a mining loop allocates nothing. */
export function toNibbles(address: Uint8Array, out: Uint8Array): Uint8Array {
  for (let index = 0; index < ADDRESS_LENGTH; index++) {
    out[index * 2] = address[index] >> 4
    out[index * 2 + 1] = address[index] & 0x0f
  }
  return out
}

export function patternToNibbles(pattern: Hex): Uint8Array {
  const body = pattern.replace(/^0x/, '').toLowerCase()
  return Uint8Array.from(body, (character) => parseInt(character, 16))
}

/**
 * Nibble-aligned contiguous match, identical to the on-chain check. Nibble alignment is what
 * lets a pattern be an odd number of hex characters and start anywhere in the address.
 */
export function containsNibbleRun(nibbles: Uint8Array, target: Uint8Array): boolean {
  const lastStart = ADDRESS_NIBBLES - target.length
  for (let start = 0; start <= lastStart; start++) {
    let offset = 0
    while (offset < target.length && nibbles[start + offset] === target[offset]) offset++
    if (offset === target.length) return true
  }
  return false
}

export interface Spec {
  minZeroBytes: number
  hookMask?: number
  /** Alternatives that all satisfy the buyer; any one of them matching is enough. */
  patterns?: Hex[]
}

/** Prepares a spec once so the mining loop only does comparisons. */
export function compileSpec(spec: Spec) {
  const targets = (spec.patterns ?? []).map(patternToNibbles)
  const nibbleBuffer = new Uint8Array(ADDRESS_NIBBLES)

  return function matches(address: Uint8Array): boolean {
    if (leadingZeroBytes(address) < spec.minZeroBytes) return false
    if (spec.hookMask !== undefined && !matchesHookMask(address, spec.hookMask)) return false
    if (targets.length === 0) return true

    toNibbles(address, nibbleBuffer)
    return targets.some((target) => containsNibbleRun(nibbleBuffer, target))
  }
}

export function satisfiesSpec(address: Uint8Array, spec: Spec): boolean {
  return compileSpec(spec)(address)
}
