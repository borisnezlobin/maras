# Maras

Your perfect address.

A marketplace for mined contract addresses on Base Sepolia. Miners grind CREATE3 salts until one
produces a rare address, list it, and a buyer deploys their own contract there in a single
transaction.

**App:** [marasmarket.vercel.app](https://marasmarket.vercel.app)
**Agents:** [marasmarket.vercel.app/api](https://marasmarket.vercel.app/api)
**Contract:** [`0x7883a2913e1adee4e16860118218992f1cd36e02`](https://sepolia.basescan.org/address/0x7883a2913e1adee4e16860118218992f1cd36e02) on Base Sepolia, from block 46677670

Named for the salt terraces at Maras in Peru, where pink salt is harvested from shallow pans.
Miners here harvest salts too.

## The vertical

A contract's address is a hash, so you cannot choose one — you can only try salts until one comes
out the shape you want. Two groups pay for specific shapes:

- **Deployers who want leading zero bytes.** Zero bytes in calldata cost less gas, so `0x000000…`
  makes every future interaction with the contract cheaper.
- **Uniswap V4 hook developers.** V4 encodes a hook's permission set in the low 14 bits of the hook
  contract's own address, so deploying a hook with a given permission set *requires* mining a salt
  whose address carries exactly those bits.

Both already run GPU miners (`createXcrunch`, `vaneth`), which is why the demand is real rather
than invented for this exercise. What they throw away is everything else the grind found: an
address containing `deadbeefcafe` is astronomically rare, and gets discarded because it was not the
thing being searched for.

### Why a market exists

Difficulty is `2^N` in the number of constrained bits. Times assume one GPU at ~600M addresses per
second; CREATE3 needs two keccaks per attempt, so it runs about half the speed of CREATE2 mining.

| Target | Expected tries | One GPU |
| --- | --- | --- |
| Contains `deadbeef` | 2³² | 7 seconds |
| 5 leading zero bytes | 2⁴⁰ | 31 minutes |
| `deadbeef` plus V4 hook bits | 2⁴⁶ | 33 hours |
| 6 leading zero bytes | 2⁴⁸ | 5.4 days |

Below about a day, people run the miner themselves. The market lives above that line.

## How it works

The marketplace contract is the CREATE3 factory, which is what lets it verify claims instead of
trusting them.

1. A miner grinds salts off-chain until one derives a qualifying address.
2. The miner sends a commitment, `keccak256(salt, seller)`, and waits one block.
3. The miner reveals. The contract re-derives the address from the salt, checks the advertised
   zero bytes, hook mask and patterns, and stores what was claimed. A false claim reverts.
4. A buyer pays and supplies their own creation code. The contract deploys it at the mined address
   and forwards payment in the same transaction.

Three ways to transact:

- **Named listing** — the address is published; you look at it and buy it.
- **Sealed listing** — only a commitment and a claimed tier are published. This suits a buyer who
  wants five zero bytes and does not care which address they get. Payment is escrowed, the seller
  has a delivery window, and a miss refunds the buyer and slashes the seller's bond.
- **Sealed request** — the buyer escrows a bounty for a spec nobody has mined, binding
  `keccak256(initCode)`. Miners work blind and never learn what will be deployed.

## Trust assumptions

For named listings and requests, nothing beyond the chain. The contract derives the address, checks
the pattern and deploys, all in one transaction, so a failed purchase costs the buyer only gas.

No private key ever exists for a sold address. A vanity *wallet* market has to hand over a key, and
since deletion is unobservable the seller can always keep a copy and drain the account later. Here
the salt is useless to anyone but this contract, and useless to it once the address is deployed.

Sealed listings add one assumption: the seller must be online to reveal within the delivery window,
backed by a slashable bond.

## Biggest design decision

**CREATE3 instead of CREATE2.** A CREATE2 address is
`keccak256(0xff ++ deployer ++ salt ++ keccak256(initCode))`, which includes the creation code — so
a mined CREATE2 address is welded to one exact contract and cannot be sold to someone who wants to
deploy something else. CREATE3 drops the code from the derivation: a fixed proxy is CREATE2-deployed
with the salt, and that proxy deploys the real contract at nonce 1, making the final address a pure
function of `(factory, salt)`.

That one change is what makes the market possible. Miners grind speculatively before a buyer
exists, buyers bring arbitrary code, and a request binds the buyer's code by hash while the miner
works without seeing it.

It creates one trap: inside the deployed contract's constructor, `msg.sender` is the intermediate
proxy, not the buyer, so `owner = msg.sender` would hand the contract to a throwaway. Payloads take
their owner as a constructor argument instead, which is free precisely because the address ignores
the code.

## One important limitation

The live demo grinds at 2²⁴–2²⁸ while the real market sits at 2⁴⁴ and up, so the economics are
argued with the table above rather than demonstrated. Mining 2⁴⁴ takes hours to days, which cannot
be filmed.

Three smaller ones: named listings are inspectable by design, so only the sealed flows meet the
brief's "cannot inspect before paying" framing; today's buyers are exchanges and hook developers
rather than autonomous agents; and a seller's only moat is idle GPU time, which anyone can rent.

Two gaps in the contract, both one small function away: a request nobody fills leaves its bounty
escrowed with no way for the buyer to reclaim it, and a seller cannot withdraw an unsold listing.

## Agents

The MCP server is at `https://marasmarket.vercel.app/api/mcp`, documented at
[/api](https://marasmarket.vercel.app/api). It covers every entry point the contract has, so an
agent can work either side of the market:

| | |
| --- | --- |
| Looking around | `search_addresses`, `search_sealed`, `search_requests`, `check_sealed`, `estimate_mining` |
| Buying | `prepare_buy`, `prepare_buy_sealed`, `prepare_timeout_sealed`, `prepare_request` |
| Mining and selling | `prepare_commit_salt`, `prepare_list_named`, `prepare_list_sealed`, `prepare_deliver_sealed`, `prepare_fill_request` |

It holds no keys. Every `prepare_` tool returns an unsigned transaction — destination, value,
calldata — which the caller signs with a wallet it controls.

A salt is the other secret. `listSealed` and `commitSalt` take `keccak256(salt, seller)`, so
handing this server a raw salt lets it compute that commitment — and lets it commit the salt under
its own address first. Both tools accept a precomputed `commitHash` instead, which removes the
question. After a reveal the salt is public calldata regardless.

Selling sealed runs on a clock: buying starts a ten-minute delivery window, and nothing wakes an
agent when it opens. A seller agent polls `check_sealed` and sends `prepare_deliver_sealed` when a
buyer appears. Ten minutes is roughly three hundred Base blocks, so the risk is an agent that is
not running rather than one that is too slow.

`mcp/server.ts` is a local stdio server for an agent that would rather the server signed for it,
reading `BASE_SEPOLIA_PRIVATE_KEY` from its own environment.

A seller agent needs no MCP server at all:

```bash
MINE_ZERO_BYTES=3 npx hardhat run scripts/mine-and-list.ts --network baseSepolia
npx tsx scripts/new-wallet.ts    # generates a wallet for the agent to be funded once
```

## Running it

```bash
pnpm install
npx hardhat test
npx hardhat keystore set BASE_SEPOLIA_PRIVATE_KEY
npx hardhat run scripts/deploy.ts --network baseSepolia
npx tsx scripts/gen-web-abi.ts
pnpm --dir web dev
```

Mining options are `MINE_ZERO_BYTES`, `MINE_PATTERN`, `MINE_LOOSE`, `MINE_HOOK_MASK` and
`MINE_PRICE_ETH`. `MINE_LOOSE=1` also accepts lookalike spellings, so `cafe` matches `caf3`, `c4fe`
and `c4f3`, which shortens the grind about fourfold.

```bash
npx hardhat run scripts/fill-request.ts --network baseSepolia   # earn an open bounty
npx tsx scripts/verify-parity.ts                                # miner agrees with the contract
```

### Selling an address nobody can see

The sealed flow takes two commands, because the seller has to be around to reveal. Listing mines a
salt, publishes only a commitment to it, and posts a bond; the address itself never reaches the
chain, so a buyer pays before seeing it.

```bash
SEALED_ZERO_BYTES=2 SEALED_PRICE_ETH=0.002 npx hardhat run scripts/list-sealed.ts --network baseSepolia
SEALED_ID=0 npx hardhat run scripts/deliver-sealed.ts --network baseSepolia
```

The second command waits for a buyer, then reveals the salt and deploys their payload at the mined
address. They bound that payload by hash when they paid, so it cannot be swapped for another. The
delivery window is ten minutes: miss it and the buyer reclaims the price and the bond.

The mined salt is written to `deployments/sealed.local.json`, which git ignores. Publishing it would
let anyone derive the address without paying, which is the whole thing a sealed listing sells.

## Layout

```
contracts/Maras.sol      marketplace and CREATE3 factory
shared/create3.ts        off-chain derivation, checked against the contract by test/derivation.ts
miner/                   grinding core
scripts/                 deploy, mine and list, fill a request, generate a wallet
mcp/server.ts            local stdio MCP server
web/                     Next.js front end and the hosted MCP endpoint
```

## Prior art

GPU miners (`createXcrunch`, `vaneth`, `create2crunch`, `ERADICATE2`) are free and are the real
competition below the cost line. Vanity Market sells mining as a service over Golem compute, so
there is no inventory or resale. Uniswap's V4 address-mining challenge had participants submit
salts to a contract that verified them on chain — the same primitive, as a contest rather than a
market. Generic escrow contracts and CREATE3 factories are standard infrastructure.

Absent from all of it: an escrowed market for contract-address salts where the contract verifies
the claimed pattern itself and atomically deploys the buyer's code.
