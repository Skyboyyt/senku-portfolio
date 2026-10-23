"use client";

import { cn } from "@/lib/utils";

const OPTIONS = [7, 30, 90];

/** Segmented control for the reporting window. */
export function RangeSelect({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Date range" className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {OPTIONS.map((days) => (
        <button
          key={days}
          type="button"
          role="radio"
          aria-checked={value === days}
          onClick={() => onChange(days)}
          className={cn(
            "min-h-10 rounded-[5px] px-3 text-[13px] font-medium transition-colors sm:min-h-8",
            value === days ? "bg-surface-3 text-text" : "text-muted hover:text-text",
          )}
        >
          {days} days
        </button>
      ))}
    </div>
  );
}
