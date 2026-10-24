import { useId, type ReactElement, type ReactNode, cloneElement } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: ReactNode;
  /** The control. It receives id, aria-invalid and aria-describedby automatically. */
  children: ReactElement<Record<string, unknown>>;
  hint?: ReactNode;
  error?: string;
  className?: string;
  optional?: boolean;
}

export function Field({ label, children, hint, error, className, optional }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-sm font-medium text-text">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-subtle">Optional</span>}
      </label>
      {cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error && (
        <p id={hintId} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}
