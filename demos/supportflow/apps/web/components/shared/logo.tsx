import { cn } from "@/lib/utils";

/** SupportFlow mark: a speech bubble whose tail turns into a forward line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--primary)" />
      <path
        d="M7 9.5h10M7 13.5h6.5"
        stroke="var(--primary-fg)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M13.5 13.5 17 17" stroke="var(--primary-fg)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-[-0.01em] text-text", className)}>
      <LogoMark />
      <span>SupportFlow</span>
    </span>
  );
}
