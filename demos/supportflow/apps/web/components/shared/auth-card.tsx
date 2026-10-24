import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <h1 className="text-[1.6rem] font-semibold tracking-[-0.02em] text-text">{title}</h1>
      {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
      <div className="mt-7">{children}</div>
      {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
    </>
  );
}
