"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { ConversationList } from "@/components/app/inbox/conversation-list";
import { cn } from "@/lib/utils";

/** The list stays mounted while switching conversations; on phones only one pane shows. */
export default function InboxLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const selected = params.id ?? null;
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] md:h-dvh">
      <div className={cn("w-full shrink-0 border-r border-border md:w-[340px] lg:w-[360px]", selected && "hidden md:block")}>
        <ConversationList selectedId={selected} />
      </div>
      <div className={cn("min-w-0 flex-1", !selected && "hidden md:block")}>{children}</div>
    </div>
  );
}
