import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-sm hover:bg-primary-hover",
        secondary: "border border-border bg-surface text-text shadow-sm hover:border-border-strong hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-text",
        danger: "bg-danger text-white shadow-sm hover:bg-danger-hover dark:text-[#1b0b09]",
        "danger-ghost": "text-danger hover:bg-danger-soft",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        // Touch targets are 44px on small screens and compact on desktop.
        sm: "h-10 px-3 text-[13px] sm:h-8",
        md: "h-11 px-4 text-sm sm:h-9",
        lg: "h-12 px-5 text-[15px] sm:h-11",
        icon: "size-11 sm:size-9",
        "icon-sm": "size-10 sm:size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild, loading, disabled, children, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Spinner className="size-4" />}
          {children}
        </>
      )}
    </Component>
  );
}
