import type { ReactNode } from "react";

export interface Slide {
  id: string;
  render: () => ReactNode;
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="text-3xl font-extrabold text-text sm:text-5xl">{children}</h2>;
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="max-w-2xl text-lg text-text-muted sm:text-xl">{children}</p>;
}

/** The Sacred Valley terraces: stacked evaporation pans stepping down a slope. */
function TerraceSketch() {
  const rows = [
    { y: 96, width: 300, offset: 0 },
    { y: 120, width: 268, offset: 16 },
    { y: 144, width: 232, offset: 34 },
    { y: 168, width: 190, offset: 55 },
    { y: 192, width: 142, offset: 79 },
  ];

  return (
    <svg viewBox="0 0 320 230" className="w-full max-w-sm" role="img" aria-label="Salt terraces">
      <path
        d="M20 96 L70 28 L128 62 L186 18 L244 66 L300 96 Z"
        fill="none"
        stroke="var(--edge-strong)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {rows.map((row) => (
        <g key={row.y}>
          <rect
            x={10 + row.offset}
            y={row.y}
            width={row.width}
            height="18"
            rx="3"
            fill="var(--accent-soft)"
            stroke="var(--accent-edge)"
            strokeWidth="1"
          />
          <rect
            x={10 + row.offset}
            y={row.y}
            width={row.width * 0.34}
            height="18"
            rx="3"
            fill="var(--accent)"
            opacity="0.28"
          />
        </g>
      ))}
    </svg>
  );
}

/** One grind produces many rare addresses; all but the wanted one are thrown away. */
function DiscardDiagram() {
  const found = [
    { label: "0x00000dead…", kept: false },
    { label: "0x0cafebabe…", kept: false },
    { label: "0x5318008…", kept: true },
    { label: "0xdeadbeefcafe…", kept: false },
    { label: "0x000000b0b…", kept: false },
  ];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {found.map((row) => (
        <div
          key={row.label}
          className={`flex items-center justify-between gap-4 rounded-[var(--radius-control)] px-4 py-3 ${
            row.kept ? "bg-accent text-text-inverse" : "bg-inert"
          }`}
        >
          <span className={`hex text-sm ${row.kept ? "" : "text-text-subtle line-through"}`}>
            {row.label}
          </span>
          <span className={`text-sm font-semibold ${row.kept ? "" : "text-text-subtle"}`}>
            {row.kept ? "kept" : "discarded"}
          </span>
        </div>
      ))}
    </div>
  );
}

function DifficultyTable() {
  const rows = [
    ["Contains deadbeef", "2³²", "7 seconds"],
    ["5 leading zero bytes", "2⁴⁰", "31 minutes"],
    ["deadbeef + V4 hook bits", "2⁴⁶", "33 hours"],
    ["6 leading zero bytes", "2⁴⁸", "5.4 days"],
  ];

  return (
    <table className="w-full max-w-2xl text-left text-base sm:text-lg">
      <tbody>
        {rows.map(([target, tries, time], index) => (
          <tr key={target} className={index === 0 ? "" : "border-t border-edge"}>
            <td className="py-3 pr-6 text-text">{target}</td>
            <td className="py-3 pr-6 text-text-muted">{tries}</td>
            <td className="py-3 font-semibold text-accent">{time}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Steps({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-2">
      {items.map(([heading, body]) => (
        <div key={heading} className="flex flex-col gap-1.5 rounded-[var(--radius-card)] bg-surface-raised p-5 shadow-[var(--shadow-card)]">
          <span className="font-bold text-text">{heading}</span>
          <span className="text-sm text-text-muted">{body}</span>
        </div>
      ))}
    </div>
  );
}

export const SLIDES: Slide[] = [
  {
    id: "title",
    render: () => (
      <div className="flex flex-col items-center gap-8 text-center">
        <TerraceSketch />
        <div className="flex flex-col gap-3">
          <h1 className="text-6xl font-extrabold tracking-tight text-text sm:text-8xl">Maras</h1>
          <p className="text-2xl font-semibold text-accent sm:text-3xl">Your perfect address.</p>
          <Lead>A marketplace for mined contract addresses.</Lead>
        </div>
      </div>
    ),
  },
  {
    id: "problem",
    render: () => (
      <div className="flex flex-col items-center gap-8 text-center">
        <Title>One grind. Everything else thrown away.</Title>
        <DiscardDiagram />
      </div>
    ),
  },
  {
    id: "cost",
    render: () => (
      <div className="flex flex-col items-center gap-8 text-center">
        <Title>Rarity is measured in GPU-days</Title>
        <DifficultyTable />
      </div>
    ),
  },
  {
    id: "users",
    render: () => (
      <div className="flex flex-col items-center gap-8 text-center">
        <Title>Who pays</Title>
        <div className="flex flex-col gap-4 text-2xl sm:text-4xl">
          <p className="text-text">
            Exchanges want <span className="hex text-accent">0x000000…</span> for the gas
          </p>
          <p className="text-text">
            V4 hooks <span className="text-accent">must</span> match 14 address bits
          </p>
          <p className="text-text-muted">Nobody wants to wait 27 weeks</p>
        </div>
      </div>
    ),
  },
  {
    id: "solution",
    render: () => (
      <div className="flex flex-col items-center gap-8 text-center">
        <Title>Maras</Title>
        <Steps
          items={[
            ["Sell the salt you found", "The one you were not looking for is worth something to someone."],
            ["Post a bounty", "Escrow it for an address nobody has mined yet."],
            ["Earn on idle GPUs", "Grind while you are not using them."],
            ["Buy and deploy", "Payment and deployment in one transaction."],
          ]}
        />
      </div>
    ),
  },
  {
    id: "why-1",
    render: () => (
      <div className="flex flex-col items-center gap-8 text-center">
        <Title>Arrow&rsquo;s information paradox</Title>
        <Lead>
          You cannot check information before buying it, because checking it is having it. Sample a
          dataset and you no longer need to pay. Sell a secret once and it stops being one.
        </Lead>
        <p className="max-w-2xl text-xl font-semibold text-text">
          So the good has to be cheap to verify and expensive to produce.
        </p>
      </div>
    ),
  },
  {
    id: "why-2",
    render: () => (
      <div className="flex flex-col items-center gap-8 text-center">
        <Title>A salt is exactly that</Title>
        <Steps
          items={[
            ["Expensive to produce", "Days of GPU time for a rare address."],
            ["One keccak to verify", "The contract checks the claim itself."],
            ["Worthless once revealed", "See the salt and you need not pay, so reveal comes after payment."],
            ["Front-runnable", "Which is why a seller commits before revealing."],
          ]}
        />
      </div>
    ),
  },
  {
    id: "agents",
    render: () => (
      <div className="flex flex-col items-center gap-8 text-center">
        <Title>Agent-first</Title>
        <Steps
          items={[
            ["Hosted MCP", "A URL. Nothing to clone, nothing installed."],
            ["Holds no keys", "Returns unsigned transactions for your wallet to sign."],
            ["Copy-paste jobs", "Mine, fill a bounty, buy, request."],
            ["Hands-off profit", "Your GPU earns while you are not using it."],
          ]}
        />
        <p className="text-2xl font-semibold text-accent sm:text-3xl">
          Deploy your contract to your perfect address.
        </p>
      </div>
    ),
  },
  {
    id: "next",
    render: () => (
      <div className="flex flex-col items-center gap-8 text-center">
        <Title>Where it goes</Title>
        <Steps
          items={[
            [
              "Vanity wallets, carefully",
              "Selling a private key is a lemon market: deletion is unobservable. Sell a smart account whose owner slot transfers on-chain instead.",
            ],
            ["Any verifiable grind", "Function selectors with leading zero bytes. Rare deterministic mints."],
            ["Seeds beyond addresses", "Anything a contract can check: a hash meeting a spec, a nonce, a proof."],
            ["A standing order book", "Bounties that persist, so miners always have something to point idle compute at."],
          ]}
        />
      </div>
    ),
  },
];
