import type { Metadata } from "next";

import { Deck } from "@/components/present/Deck";

export const metadata: Metadata = {
  title: "Maras — Your perfect address",
  description: "A marketplace for mined contract addresses.",
};

export default function PresentPage() {
  return <Deck />;
}
