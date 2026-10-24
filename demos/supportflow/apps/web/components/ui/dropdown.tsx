"use client";

import { DropdownMenu as M } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;
export const DropdownSeparator = ({ className }: { className?: string }) => (
  <M.Separator className={cn("my-1 h-px bg-border", className)} />
);
export const DropdownLabel = ({ children }: { children: ReactNode }) => (
  <M.Label className="px-2.5 py-1.5 text-xs font-medium text-subtle">{children}</M.Label>
);

export function DropdownContent({ className, align = "end", ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 rounded-lg border border-border bg-surface p-1 shadow-lg outline-none",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownItem({ className, destructive, ...props }: ComponentProps<typeof M.Item> & { destructive?: boolean }) {
  return (
    <M.Item
      className={cn(
        "flex min-h-10 cursor-default select-none items-center gap-2 rounded-md px-2.5 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 sm:min-h-8 [&_svg]:size-4 [&_svg]:text-muted",
        destructive ? "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger" : "text-text",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownRadioGroup(props: ComponentProps<typeof M.RadioGroup>) {
  return <M.RadioGroup {...props} />;
}

export function DropdownRadioItem({ className, children, ...props }: ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem
      className={cn(
        "relative flex min-h-10 cursor-default select-none items-center rounded-md pl-7 pr-2.5 text-sm text-text outline-none data-[highlighted]:bg-surface-2 sm:min-h-8",
        className,
      )}
      {...props}
    >
      <M.ItemIndicator className="absolute left-2.5 size-1.5 rounded-full bg-primary" />
      {children}
    </M.RadioItem>
  );
}
