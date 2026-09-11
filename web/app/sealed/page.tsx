import type { Metadata } from "next";

import { SealedListings } from "@/components/SealedListings";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Sealed — Maras",
  description: "Addresses you pay for before you see them, backed by the seller's bond.",
};

export default function SealedPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-col gap-8 px-5 py-10 sm:px-8">
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="text-3xl font-extrabold text-text">Sealed</h1>
          <p className="text-base text-text-muted">
            You pay before you see the address. The seller then has ten minutes to deliver one
            that keeps the promise on the card, and the contract checks it before deploying. If
            they miss, you get your payment back and their bond with it.
          </p>
        </div>
        <SealedListings />
      </main>
    </>
  );
}
