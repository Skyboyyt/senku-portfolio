import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-primary">{children}</p>;
}

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <Container className="pb-12 pt-14 sm:pb-16 sm:pt-20">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-3 max-w-3xl font-display text-[2.5rem] leading-[1.08] tracking-[-0.01em] text-text sm:text-[3.25rem]">
        {title}
      </h1>
      {children && <div className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{children}</div>}
    </Container>
  );
}
