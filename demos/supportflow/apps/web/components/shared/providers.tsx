"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, fetcher } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SWRConfig
        value={{
          fetcher,
          revalidateOnFocus: true,
          shouldRetryOnError: (error) => !(error instanceof ApiError) || error.status >= 500,
          errorRetryCount: 2,
        }}
      >
        <TooltipProvider>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </SWRConfig>
    </MotionConfig>
  );
}
