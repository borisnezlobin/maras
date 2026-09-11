import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { bytesToHex, getAddress, hexToBytes, toHex } from "viem";

import {
  ADDRESS_NIBBLES,
  containsNibbleRun,
  createDeriver,
  leadingZeroBytes,
  matchesHookMask,
  patternToNibbles,
  toNibbles,
} from "../shared/create3.js";

function saltAt(index: number) {
  return toHex(index, { size: 32 });
}

describe("CREATE3 derivation parity", async function () {
  const { viem } = await network.create();

  it("off-chain derivation matches the contract for many salts", async function () {
    const maras = await viem.deployContract("Maras");
    const derive = createDeriver(maras.address);

    for (let index = 0; index < 64; index++) {
      const salt = saltAt(index);
      const offChain = getAddress(bytesToHex(derive(hexToBytes(salt))));
      const onChain = getAddress(await maras.read.predictAddress([salt]));
      assert.equal(offChain, onChain, `mismatch at salt ${salt}`);
    }
  });

  it("a mined address actually receives the deployment", async function () {
    const maras = await viem.deployContract("Maras");
    const derive = createDeriver(maras.address);
    const salt = saltAt(7);
    const predicted = getAddress(bytesToHex(derive(hexToBytes(salt))));

    assert.equal(predicted, getAddress(await maras.read.predictAddress([salt])));
  });
});

describe("spec predicates", function () {
  it("counts leading zero bytes from the most significant byte", function () {
    assert.equal(leadingZeroBytes(hexToBytes("0x0000ab00000000000000000000000000000000cd")), 2);
    assert.equal(leadingZeroBytes(hexToBytes("0xab00000000000000000000000000000000000000")), 0);
  });

  it("compares hook permissions as an exact low-14-bit mask", function () {
    const address = hexToBytes("0x0000000000000000000000000000000000002400");
    assert.equal(matchesHookMask(address, 0x2400), true);
    assert.equal(matchesHookMask(address, 0x2401), false);
  });

  it("matches patterns anywhere in the address, including odd lengths", function () {
    const nibbles = toNibbles(
      hexToBytes("0x00deadbeef00000000000000000000000000cafe"),
      new Uint8Array(ADDRESS_NIBBLES),
    );

    assert.equal(containsNibbleRun(nibbles, patternToNibbles("0xdeadbeef")), true);
    assert.equal(containsNibbleRun(nibbles, patternToNibbles("0xcafe")), true);
    assert.equal(containsNibbleRun(nibbles, patternToNibbles("0xfeedface")), false);
  });

  it("finds a run that starts on an odd nibble", function () {
    const nibbles = toNibbles(
      hexToBytes("0x0abcde0000000000000000000000000000000000"),
      new Uint8Array(ADDRESS_NIBBLES),
    );

    // "abcde" begins at nibble 1, which a byte-aligned search would miss entirely.
    assert.equal(containsNibbleRun(nibbles, patternToNibbles("0xabcde")), true);
  });
});
