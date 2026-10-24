"use client";

import { ErrorState } from "@/components/ui/states";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <ErrorState message="Something went wrong while showing this page. Your data is safe; try again." onRetry={reset} />
    </main>
  );
}
