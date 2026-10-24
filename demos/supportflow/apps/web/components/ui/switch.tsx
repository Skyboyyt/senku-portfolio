"use client";

import { Switch as S } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-surface-3 transition-colors data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50",
        // Larger hit area than the visible track for touch.
        "before:absolute before:-inset-2.5 before:content-['']",
        className,
      )}
      {...props}
    >
      <S.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px] dark:bg-text dark:data-[state=checked]:bg-primary-fg" />
    </S.Root>
  );
}
