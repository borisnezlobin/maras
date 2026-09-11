# Maras

A marketplace for mined contract addresses, on Base Sepolia. Miners grind CREATE3 salts until one
produces a rare address, list it, and a buyer deploys their own contract at that address in a single
transaction.

Named for the salt evaporation terraces at Maras in Peru, where pink salt is harvested from shallow
pans. The palette comes from the place.

**Live app:** [marasmarket.vercel.app](https://marasmarket.vercel.app)

**Contract:** [`0x838348307cecfe418596890a26ed7a1b598e338a`](https://sepolia.basescan.org/address/0x838348307cecfe418596890a26ed7a1b598e338a)
on Base Sepolia (chainId 84532), deployed at block 46670455.

## The vertical

A contract's address is a hash of its deployer, a salt, and (for CREATE2) its code. You cannot choose
an address; you can only try salts until one comes out the shape you want. Two groups pay real money
for specific shapes today:

- **Deployers who want leading zero bytes.** Zero bytes in calldata cost less gas, so an address like
  `0x000000…` makes every future interaction with the contract cheaper. Exchanges and high-traffic
  protocols mine these.
- **Uniswap V4 hook developers.** V4 encodes a hook's permission set in the **low 14 bits of the hook
  contract's own address**, so deploying a hook with a given permission set *requires* mining a salt
  whose resulting address carries exactly those bits. This is not optional for them.

The sellers are whoever has idle GPUs. Off-the-shelf miners already exist (`createXcrunch`, `vaneth`,
`create2crunch`), which is the evidence the demand is real rather than invented for this exercise.

### Why a market exists at all

Difficulty is `2^N` in the number of constrained bits, so cost climbs 16x per hex character. Times
below assume one strong GPU at roughly 600M candidate addresses per second (CREATE3 needs two keccaks
per attempt, so it runs about half the speed of CREATE2 mining).

| Target | Expected tries | One GPU |
| --- | --- | --- |
| Contains `deadbeef` | 2³² | 7 seconds |
| 5 leading zero bytes | 2⁴⁰ | 31 minutes |
| `deadbeef` plus V4 hook bits | 2⁴⁶ | 33 hours |
| 6 leading zero bytes | 2⁴⁸ | 5.4 days |

The 14 hook bits alone are only ~16k tries, which is why hook mining by itself is free. Vanity
constraints are what create the cost. Below roughly a day of grinding people just run the miner
themselves, so the market lives above that line.

## How it works

The marketplace contract is itself the CREATE3 factory, which is what lets it verify claims rather
than trust them.

1. A miner grinds salts off-chain until one derives a qualifying address.
2. The miner sends a commitment, `keccak256(salt, seller)`, and waits one block.
3. The miner reveals. The contract re-derives the address from the salt and checks the advertised
   leading zero bytes, hook mask and pattern on chain. A false claim reverts.
4. A buyer pays and supplies their own creation code. The contract deploys it at the mined address
   and forwards payment in the same transaction.

Three ways to transact, two of which the buyer genuinely cannot inspect before paying:

- **Named listing** — the address is published; you look at it and buy it. Inspectable by design.
- **Sealed listing** — only a commitment and a claimed tier are published. This suits a
  gas-optimization buyer who wants five zero bytes and is indifferent to which address they get.
  Payment is escrowed, the seller has a delivery window, and a miss refunds the buyer and slashes the
  seller's bond.
- **Sealed request** — the buyer escrows a bounty for a spec nobody has mined yet, binding
  `keccak256(initCode)`. Miners work blind and never learn what will be deployed.

## Trust assumptions

For named listings and requests, nothing beyond the chain itself. The contract derives the address,
checks the pattern, and deploys, all in one transaction. A wrong salt or a false claim reverts, so a
failed purchase costs the buyer only gas.

**No private key ever exists for a sold address.** This is the point of using CREATE3 rather than
selling vanity wallets. A wallet-address market has to hand over a private key, and since deletion is
unobservable the seller can always keep a copy and drain the account later — an unfixable lemon
market. Here the salt is useless to anyone but this contract, and useless to it once the address is
deployed.

Sealed listings add one assumption: the seller must be online to reveal within the delivery window.
That is backed by a slashable bond rather than good faith.

## Biggest design decision

**CREATE3 instead of CREATE2.** A CREATE2 address is
`keccak256(0xff ++ deployer ++ salt ++ keccak256(initCode))`, which includes the creation code — so a
mined CREATE2 address is welded to one exact contract and cannot be sold to someone who wants to
deploy something else. CREATE3 drops the code from the derivation: a fixed proxy is CREATE2-deployed
with the salt, and that proxy deploys the real contract at nonce 1, making the final address a pure
function of `(factory, salt)`.

That single change is what makes the whole market possible. Miners can grind speculatively before a
buyer exists, buyers bring arbitrary code, and a request can bind the buyer's code by hash while the
miner works without ever seeing it.

It also creates the one trap worth knowing about: inside the deployed contract's constructor,
`msg.sender` is the intermediate proxy, not the buyer. `owner = msg.sender` would hand the contract to
a throwaway. Payloads take their owner as a constructor argument instead, which is free precisely
because the address ignores the code. There is a test asserting the owner is the buyer and not the
proxy.

## One important limitation

**The live demo grinds at a difficulty the market would never charge for.** Mining 2⁴⁴-and-up takes
hours to days, which cannot be shown on camera, so the demo mines 2-byte targets that land in
seconds. The mechanism is identical at both ends, but the economic tension is argued with the table
above rather than demonstrated.

Three smaller ones, stated plainly: named listings are inspectable and so do not satisfy the
"can't inspect before paying" framing — only the sealed flows do; today's real buyers are exchanges
and hook developers rather than autonomous agents, so the agent framing is a thin wrapper over a human
market; and a seller's only moat is idle GPU time, which anyone can rent, so margins are thin.

## Prior art

Plenty of free GPU miners exist, and they are the real competition — below the cost line a buyer just
runs one. Vanity Market sells mining *as a service* over Golem compute, so there is no inventory or
resale. VAIN advertised buying and selling vanity ETH addresses but is offline. Uniswap's V4
address-mining challenge had participants submit salts to a contract that verified them on chain,
which is the same verification primitive, but as a one-off contest rather than a market. Generic
escrow contracts and CREATE3 factories (CreateX) are both standard infrastructure.

What seems absent is the combination: an escrowed market for contract-address *salts* where the
contract verifies the claimed pattern itself and atomically deploys the buyer's code. The components
here are off-the-shelf; the contribution is the composition and the two sealed flows.

## Sending an agent

The live app has copy-paste prompts, and the MCP server exposes four tools: `search_addresses`,
`buy_address`, `post_request`, `submit_salt`. Point an agent at it with:

```json
{
  "mcpServers": {
    "maras": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "cwd": "/path/to/maras",
      "env": { "BASE_SEPOLIA_PRIVATE_KEY": "0xyour-testnet-key" }
    }
  }
}
```

The RPC endpoint is public and defaults on its own, so a key is the only thing an agent needs.
A seller agent does not need the MCP server at all — it can mine and list in a loop with
`MINE_ZERO_BYTES=3 npx hardhat run scripts/mine-and-list.ts --network baseSepolia`.

## Running it

```bash
pnpm install
npx hardhat test                  # 14 tests
npx hardhat keystore set BASE_SEPOLIA_PRIVATE_KEY
npx hardhat run scripts/deploy.ts --network baseSepolia
npx tsx scripts/gen-web-abi.ts    # writes the deployed address into the web app
pnpm --dir web dev
```

Mine and list an address, or fill open requests, as the seller agent:

```bash
npx tsx miner/agent.ts list 2 0.001
npx tsx miner/agent.ts fill
```

The same operations are exposed to agents over MCP (`search_addresses`, `buy_address`,
`post_request`, `submit_salt`):

```bash
npx tsx mcp/server.ts
```

## Layout

```
contracts/Maras.sol      marketplace and CREATE3 factory
shared/create3.ts        off-chain derivation, mirrored by a test against the contract
miner/                   grinding core and seller agent
mcp/server.ts            agent-facing tools
web/                     Next.js front end
```

`shared/create3.ts` must derive exactly the same address as the contract; a one-byte divergence fails
silently and every mined address would simply be wrong. `test/derivation.ts` checks parity across 64
salts and is the first thing to run after touching either side.
