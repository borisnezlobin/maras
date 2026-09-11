import type { Metadata } from "next";

import { AccountPage } from "@/components/AccountPage";
import { MyAddresses } from "@/components/MyAddresses";

export const metadata: Metadata = {
  title: "My addresses — Maras",
  description: "The addresses you own, and what each one points at.",
};

export default function AddressesPage() {
  return (
    <AccountPage
      title="My addresses"
      connectReason="Connect the wallet you bought with to see the addresses it owns."
    >
      <MyAddresses />
    </AccountPage>
  );
}
