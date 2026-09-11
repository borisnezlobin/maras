import { mkdirSync, writeFileSync } from "node:fs";

import { network } from "hardhat";

const { viem } = await network.create({ network: "baseSepolia", chainType: "op" });

const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const balance = await publicClient.getBalance({ address: deployer.account.address });
console.log("Deploying from", deployer.account.address, "balance", balance, "wei");

const maras = await viem.deployContract("Maras");
const blockNumber = await publicClient.getBlockNumber();

console.log("Maras deployed at", maras.address);
console.log("Block at or after deployment", blockNumber);
console.log("Explorer", `https://sepolia.basescan.org/address/${maras.address}`);

mkdirSync("deployments", { recursive: true });
writeFileSync(
  "deployments/baseSepolia.json",
  `${JSON.stringify(
    {
      network: "baseSepolia",
      chainId: 84532,
      address: maras.address,
      blockNumber: Number(blockNumber),
      explorer: `https://sepolia.basescan.org/address/${maras.address}`,
    },
    null,
    2,
  )}\n`,
);
