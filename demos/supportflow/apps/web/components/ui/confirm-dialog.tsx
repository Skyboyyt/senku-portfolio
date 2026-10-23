"use client";

import { AlertDialog as A } from "radix-ui";
import { useState, type ReactNode } from "react";
import { errorMessage } from "@/lib/api";
import { Button } from "./button";
import { FormError } from "./field";

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  /** Return a promise; the dialog stays open and shows the error if it rejects. */
  onConfirm: () => Promise<unknown> | void;
  /** Extra content, for example a "type the name to confirm" field. */
  children?: ReactNode;
  confirmDisabled?: boolean;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  tone = "danger",
  onConfirm,
  children,
  confirmDisabled,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <A.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <A.Trigger asChild>{trigger}</A.Trigger>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <A.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl border border-border bg-surface p-5 shadow-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6">
          <A.Title className="text-base font-semibold text-text">{title}</A.Title>
          <A.Description asChild>
            <div className="mt-2 text-sm leading-relaxed text-muted">{description}</div>
          </A.Description>
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-4">
            <FormError message={error} />
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <A.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </A.Cancel>
            <Button variant={tone} loading={pending} disabled={confirmDisabled} onClick={confirm}>
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
