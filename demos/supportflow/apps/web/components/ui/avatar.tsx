import { cn, initials } from "@/lib/utils";

export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-muted",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
