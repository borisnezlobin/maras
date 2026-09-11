import type { Metadata } from "next";

import { MarketBrowser } from "@/components/MarketBrowser";

export const metadata: Metadata = {
  title: "Browse — Maras",
  description: "Contract addresses other people already spent the compute to find.",
};

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const zeros = Number(first(params.zeros));

  return (
    <MarketBrowser
      initialSearch={first(params.q)}
      initialZeroBytes={Number.isFinite(zeros) ? Math.min(6, Math.max(0, zeros)) : 0}
    />
  );
}
