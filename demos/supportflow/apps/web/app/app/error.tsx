"use client";

import { ErrorState } from "@/components/ui/states";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <ErrorState message="This part of the dashboard hit an unexpected error. Try again, or reload the page." onRetry={reset} />
    </div>
  );
}
