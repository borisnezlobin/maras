"use client";

import { CaretDown, SignOut, Wallet } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui";

const ACCOUNT_LINKS = [
  { href: "/addresses", label: "My addresses" },
  { href: "/requests", label: "My requests" },
] as const;

const ITEM =
  "flex items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Closes on a click outside or Escape, and hands focus back to the trigger after Escape. */
function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;

    function onPointer(event: PointerEvent) {
      if (root.current !== null && !root.current.contains(event.target as Node)) close();
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      close();
      root.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
    }

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, root]);
}

function ConnectButton() {
  const { connect, connectors, isPending } = useConnect();
  const injected = connectors[0];

  return (
    <Button
      onClick={() => injected && connect({ connector: injected })}
      disabled={isPending || injected === undefined}
    >
      <Wallet size={16} aria-hidden="true" />
      {isPending ? "Opening your wallet…" : "Connect wallet"}
    </Button>
  );
}

export function WalletMenu() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useDismiss(open, close, root);

  if (!isConnected || address === undefined) return <ConnectButton />;

  return (
    <div ref={root} className="relative">
      <Button
        variant="secondary"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="wallet-menu"
      >
        <span className="hex">{shorten(address)}</span>
        <CaretDown
          size={14}
          weight="bold"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>

      {open && (
        <div
          id="wallet-menu"
          className="absolute end-0 top-full z-30 mt-2 flex w-72 flex-col gap-2 rounded-[var(--radius-card)] bg-surface-raised p-2 shadow-[var(--shadow-lift)]"
        >
          <p className="hex break-all px-3 pt-1 text-xs text-text-muted">{address}</p>

          <nav aria-label="Your account" className="flex flex-col">
            {ACCOUNT_LINKS.map((link) => (
              <Link key={link.href} href={link.href} onClick={close} className={`${ITEM} text-text`}>
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            onClick={() => {
              close();
              disconnect();
            }}
            className={`${ITEM} text-start text-text-muted hover:text-text`}
          >
            <SignOut size={16} aria-hidden="true" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
