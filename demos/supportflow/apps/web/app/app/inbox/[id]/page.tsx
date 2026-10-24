"use client";

import { useParams } from "next/navigation";
import { ConversationThread } from "@/components/app/inbox/conversation-thread";

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  return <ConversationThread key={id} id={id} />;
}
