"use client";

import { Wallet } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useAccount, useConnect } from "wagmi";

import { Button } from "@/components/ui";

/**
 * Swaps the action for a working connect button while no wallet is attached, so the page never
 * shows a dead control next to a note explaining why it is dead.
 */
export function ConnectGate({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();

  if (isConnected) return <>{children}</>;

  const injected = connectors[0];

  return (
    <Button
      className={className}
      onClick={() => injected && connect({ connector: injected })}
      disabled={isPending || injected === undefined}
    >
      <Wallet size={16} />
      {isPending ? "Check your wallet" : "Connect wallet"}
    </Button>
  );
}
