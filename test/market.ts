import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  encodeAbiParameters,
  encodeDeployData,
  getAddress,
  keccak256,
  parseEther,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

import { mineSalt } from "../miner/mine.js";
import type { Spec } from "../shared/create3.js";

const ONE_ZERO_BYTE: Spec = { minZeroBytes: 1 };

const NO_PATTERNS = Array.from({ length: 16 }, () => "0x00000000" as Hex);

const EMPTY_SPEC = {
  minZeroBytes: 0,
  hookMask: 0,
  checkHookMask: false,
  patterns: NO_PATTERNS,
  patternCount: 0,
  patternNibbles: 0,
};

function vaultArtifact() {
  return JSON.parse(
    readFileSync("artifacts/contracts/templates/OwnedVault.sol/OwnedVault.json", "utf8"),
  );
}

function vaultInitCode(owner: Address): Hex {
  const artifact = vaultArtifact();
  return encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: [owner] });
}

function proxyInitCode(owner: Address): Hex {
  const artifact = JSON.parse(
    readFileSync("artifacts/contracts/templates/OwnedProxy.sol/OwnedProxy.json", "utf8"),
  );
  return encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: [owner] });
}

function commitHashFor(salt: Hex, seller: Address): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "address" }], [salt, seller]),
  );
}

async function deployMarket() {
  const connection = await network.create();
  const { viem } = connection;
  const maras = await viem.deployContract("Maras");
  const [seller, buyer] = await viem.getWalletClients();
  return { connection, viem, maras, seller, buyer };
}

describe("ownership of the deployed payload", async function () {
  it("assigns the buyer, not the intermediate CREATE3 proxy", async function () {
    const { viem, maras, seller, buyer } = await deployMarket();
    const buyerAddress = buyer.account.address;

    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);
    await maras.write.commitSalt([commitHashFor(mined.salt, seller.account.address)]);
    await maras.write.listNamed([mined.salt, 0n, { ...EMPTY_SPEC, minZeroBytes: 1 }]);

    await maras.write.buyNamed([0n, vaultInitCode(buyerAddress)], {
      account: buyer.account,
      value: 0n,
    });

    const vault = await viem.getContractAt("OwnedVault", mined.address);
    const owner = await vault.read.owner();

    assert.equal(getAddress(owner), getAddress(buyerAddress));
    assert.notEqual(getAddress(owner), getAddress(mined.address));
    assert.notEqual(getAddress(owner), zeroAddress);
  });

  it("hands the buyer a proxy they can point at any contract, at the address they paid for", async function () {
    const { viem, maras, seller, buyer } = await deployMarket();

    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);
    await maras.write.commitSalt([commitHashFor(mined.salt, seller.account.address)]);
    await maras.write.listNamed([mined.salt, 0n, { ...EMPTY_SPEC, minZeroBytes: 1 }]);
    await maras.write.buyNamed([0n, proxyInitCode(buyer.account.address)], {
      account: buyer.account,
      value: 0n,
    });

    const proxy = await viem.getContractAt("OwnedProxy", mined.address);
    assert.equal(getAddress(await proxy.read.proxyOwner()), getAddress(buyer.account.address));

    const target = await viem.deployContract("OwnedVault", [buyer.account.address]);
    await viem.assertions.revertWithCustomError(
      proxy.write.pointTo([target.address, "0x"], { account: seller.account }),
      proxy,
      "NotOwner",
    );

    await proxy.write.pointTo([target.address, "0x"], { account: buyer.account });
    assert.equal(getAddress(await proxy.read.proxyImplementation()), getAddress(target.address));
  });
});

describe("what a listing records", async function () {
  it("keeps the spec the seller declared, so a buyer need not guess", async function () {
    const { maras, seller } = await deployMarket();
    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);

    await maras.write.commitSalt([commitHashFor(mined.salt, seller.account.address)]);
    await maras.write.listNamed([
      mined.salt,
      0n,
      { ...EMPTY_SPEC, minZeroBytes: 1, patterns: NO_PATTERNS, patternCount: 0 },
    ]);

    const listing = (await maras.read.getNamedListing([0n])) as unknown as {
      predicted: Address;
      spec: { minZeroBytes: number; patternCount: number };
    };

    assert.equal(getAddress(listing.predicted), getAddress(mined.address));
    assert.equal(listing.spec.minZeroBytes, 1);
    assert.equal(listing.spec.patternCount, 0);
  });
});

describe("commitment binding", async function () {
  it("rejects a reveal with no prior commitment", async function () {
    const { maras } = await deployMarket();
    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);

    await assert.rejects(
      maras.write.listNamed([mined.salt, 0n, { ...EMPTY_SPEC, minZeroBytes: 1 }]),
      /CommitMissing/,
    );
  });

  it("rejects a reveal of another seller's commitment", async function () {
    const { maras, seller, buyer } = await deployMarket();
    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);

    await maras.write.commitSalt([commitHashFor(mined.salt, seller.account.address)]);

    await assert.rejects(
      maras.write.listNamed([mined.salt, 0n, { ...EMPTY_SPEC, minZeroBytes: 1 }], {
        account: buyer.account,
      }),
      /CommitMissing/,
    );
  });
});

describe("spec enforcement", async function () {
  it("rejects a listing whose claimed leading zero bytes are false", async function () {
    const { maras, seller } = await deployMarket();

    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);
    await maras.write.commitSalt([commitHashFor(mined.salt, seller.account.address)]);

    await assert.rejects(
      maras.write.listNamed([mined.salt, 0n, { ...EMPTY_SPEC, minZeroBytes: 12 }]),
      /SpecNotMet/,
    );
  });

  it("rejects a false hook mask claim", async function () {
    const { maras, seller } = await deployMarket();

    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);
    await maras.write.commitSalt([commitHashFor(mined.salt, seller.account.address)]);

    await assert.rejects(
      maras.write.listNamed([
        mined.salt,
        0n,
        { ...EMPTY_SPEC, minZeroBytes: 1, hookMask: 0x3fff, checkHookMask: true },
      ]),
      /SpecNotMet/,
    );
  });
});

describe("request fulfilment binds the buyer's code", async function () {
  it("rejects a fill whose initCode hash differs from the buyer's", async function () {
    const { maras, seller, buyer } = await deployMarket();
    const buyerCode = vaultInitCode(buyer.account.address);
    const sellerCode = vaultInitCode(seller.account.address);

    await maras.write.postRequest(
      [{ ...EMPTY_SPEC, minZeroBytes: 1 }, keccak256(buyerCode)],
      { account: buyer.account, value: parseEther("0.01") },
    );

    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);
    await maras.write.commitSalt([commitHashFor(mined.salt, seller.account.address)]);

    await assert.rejects(
      maras.write.fillRequest([0n, mined.salt, sellerCode]),
      /CodeHashMismatch/,
    );
  });

  it("pays the bounty when the bound code is used", async function () {
    const { viem, maras, seller, buyer } = await deployMarket();
    const buyerCode = vaultInitCode(buyer.account.address);

    await maras.write.postRequest([{ ...EMPTY_SPEC, minZeroBytes: 1 }, keccak256(buyerCode)], {
      account: buyer.account,
      value: parseEther("0.01"),
    });

    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);
    await maras.write.commitSalt([commitHashFor(mined.salt, seller.account.address)]);
    await maras.write.fillRequest([0n, mined.salt, buyerCode]);

    const vault = await viem.getContractAt("OwnedVault", mined.address);
    assert.equal(getAddress(await vault.read.owner()), getAddress(buyer.account.address));
  });
});

describe("sealed listing lifecycle", async function () {
  it("pays the seller on delivery inside the window", async function () {
    const { viem, maras, seller, buyer } = await deployMarket();
    const buyerCode = vaultInitCode(buyer.account.address);
    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);

    await maras.write.listSealed(
      [commitHashFor(mined.salt, seller.account.address), parseEther("0.05"), { ...EMPTY_SPEC, minZeroBytes: 1 }],
      { value: parseEther("0.1") },
    );

    await maras.write.buySealed([0n, keccak256(buyerCode)], {
      account: buyer.account,
      value: parseEther("0.05"),
    });

    await maras.write.deliverSealed([0n, mined.salt, buyerCode]);

    const vault = await viem.getContractAt("OwnedVault", mined.address);
    assert.equal(getAddress(await vault.read.owner()), getAddress(buyer.account.address));
  });

  it("refunds the buyer and slashes the bond after the window closes", async function () {
    const { connection, maras, seller, buyer } = await deployMarket();
    const buyerCode = vaultInitCode(buyer.account.address);
    const mined = mineSalt(maras.address, ONE_ZERO_BYTE);

    await maras.write.listSealed(
      [commitHashFor(mined.salt, seller.account.address), parseEther("0.05"), { ...EMPTY_SPEC, minZeroBytes: 1 }],
      { value: parseEther("0.1") },
    );
    await maras.write.buySealed([0n, keccak256(buyerCode)], {
      account: buyer.account,
      value: parseEther("0.05"),
    });

    await assert.rejects(maras.write.timeoutSealed([0n], { account: buyer.account }), /WindowOpen/);

    await connection.networkHelpers.time.increase(Number(await maras.read.DELIVERY_WINDOW()) + 1);

    await maras.write.timeoutSealed([0n], { account: buyer.account });
    await assert.rejects(maras.write.deliverSealed([0n, mined.salt, buyerCode]), /AlreadySettled/);
  });
});
