"use client";

import { Wallet } from "@phosphor-icons/react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui";

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address !== undefined) {
    return (
      <Button variant="secondary" onClick={() => disconnect()}>
        <span className="hex">{shorten(address)}</span>
        <span className="text-text-subtle">Disconnect</span>
      </Button>
    );
  }

  const injectedConnector = connectors[0];

  return (
    <Button
      onClick={() => injectedConnector && connect({ connector: injectedConnector })}
      disabled={isPending || injectedConnector === undefined}
    >
      <Wallet size={16} />
      {isPending ? "Opening your wallet…" : "Connect wallet"}
    </Button>
  );
}
