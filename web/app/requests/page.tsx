import type { Metadata } from "next";

import { AccountPage } from "@/components/AccountPage";
import { MyRequests } from "@/components/MyRequests";

export const metadata: Metadata = {
  title: "My requests — Maras",
  description: "Addresses you asked miners to find, and which have been delivered.",
};

export default function RequestsPage() {
  return (
    <AccountPage
      title="My requests"
      connectReason="Connect the wallet you posted from to see your requests."
    >
      <MyRequests />
    </AccountPage>
  );
}
