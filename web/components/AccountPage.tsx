"use client";

import type { ReactNode } from "react";
import { useAccount } from "wagmi";

import { ConnectGate } from "@/components/ConnectGate";
import { SiteHeader } from "@/components/SiteHeader";
import { Card } from "@/components/ui";

/** A page about the connected wallet, which has nothing to show until one is connected. */
export function AccountPage({
  title,
  connectReason,
  children,
}: {
  title: string;
  connectReason: string;
  children: ReactNode;
}) {
  const { isConnected } = useAccount();

  return (
    <>
      <SiteHeader />
      <main className="flex flex-col gap-8 px-5 py-10 sm:px-8">
        <h1 className="text-3xl font-extrabold text-text">{title}</h1>
        {isConnected ? (
          children
        ) : (
          <Card className="flex max-w-md flex-col items-start gap-4 p-5">
            <p className="text-sm text-text-muted">{connectReason}</p>
            <ConnectGate>{null}</ConnectGate>
          </Card>
        )}
      </main>
    </>
  );
}
