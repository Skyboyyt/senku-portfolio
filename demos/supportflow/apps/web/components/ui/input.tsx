import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-md border border-border bg-surface px-3 text-[15px] text-text shadow-sm transition-[border-color,box-shadow] placeholder:text-subtle hover:border-border-strong focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20 sm:text-sm";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(field, "h-11 sm:h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        field,
        "h-11 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9 sm:h-9",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
