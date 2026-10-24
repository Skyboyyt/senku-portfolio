import { LABELS, type TicketPriority, type TicketStatus } from "@supportflow/shared";
import { Badge } from "@/components/ui/badge";

const STATUS_TONE = {
  open: "info",
  in_progress: "primary",
  waiting: "warning",
  resolved: "success",
  closed: "neutral",
} as const;

const PRIORITY_TONE = { low: "neutral", normal: "neutral", high: "warning", urgent: "danger" } as const;

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{LABELS.ticketStatus[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{LABELS.ticketPriority[priority]}</Badge>;
}
