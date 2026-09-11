# Maras

Marketplace for mined CREATE3 contract addresses. The contract is its own factory, so it verifies
every claimed address pattern itself and deploys atomically on payment. No private key ever exists
for a sold address, and no salt is usable by anyone except this contract.

`CLAUDE.md` is a symlink to this file — edit this one.

## Layout

```
contracts/Maras.sol             marketplace + CREATE3 factory
contracts/templates/            default buyer payloads (OwnedVault)
shared/create3.ts               off-chain derivation + spec predicates
miner/mine.ts                   pure grinding core
miner/agent.ts                  seller agent: commit, wait a block, reveal
scripts/deploy.ts               Base Sepolia deployment
test/                           node:test TypeScript tests
hardhat.config.ts               solc 0.8.34, baseSepolia network
```

## The invariant that matters

`shared/create3.ts` must derive exactly the same address as `CREATE3.predictDeterministicAddress`
in the contract. The miner relies on it, and a one-byte divergence fails silently — every mined
address would simply be wrong. `test/derivation.ts` guards this; run it after touching either side.

Both sides also mirror three spec predicates, which must stay in agreement: leading zero bytes,
Uniswap V4 hook mask (exact equality on the low 14 bits), and byte-aligned pattern containment.

## Two rules the contract encodes

A buyer's payload must take its owner as a **constructor argument**. During construction
`msg.sender` is the throwaway CREATE3 proxy, so `owner = msg.sender` would hand the contract to the
proxy. This is free to do because a CREATE3 address does not depend on the creation code.

Every salt reveal is bound to its seller via `keccak256(abi.encode(salt, seller))`, committed at
least one block earlier. Without that, a mempool watcher could copy a salt out of a pending
transaction and register it first.

## Commands

```shell
npx hardhat compile
npx hardhat test            # all tests
npx hardhat test nodejs     # TypeScript only
npx hardhat test solidity   # Solidity only
npx hardhat run scripts/deploy.ts --network baseSepolia
```

## Network

`baseSepolia` (chainId 84532, OP stack). The RPC URL defaults to the public
`https://sepolia.base.org` and can be overridden with a `BASE_SEPOLIA_RPC_URL` environment
variable — it is not a secret, so it does not belong in the keystore.

The private key is the only secret: `npx hardhat keystore set BASE_SEPOLIA_PRIVATE_KEY`. Never
commit it; `.env` is gitignored and `.env.example` shows the shape.

## Docs

- Hardhat 3 — https://hardhat.org/llms.txt
- viem — https://viem.sh/llms.txt
