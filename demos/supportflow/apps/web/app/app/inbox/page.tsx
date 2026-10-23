import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/states";

export default function InboxIndexPage() {
  return (
    <div className="grid h-full place-items-center">
      <EmptyState icon={MessagesSquare} title="Select a conversation">
        Choose a conversation from the list to read it and reply.
      </EmptyState>
    </div>
  );
}
