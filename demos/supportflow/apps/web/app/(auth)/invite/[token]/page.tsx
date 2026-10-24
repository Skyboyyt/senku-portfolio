import type { Metadata } from "next";
import { InviteView } from "./invite-view";

export const metadata: Metadata = { title: "Join a workspace", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteView token={token} />;
}
