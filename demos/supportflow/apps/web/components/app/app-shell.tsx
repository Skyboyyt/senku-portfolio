"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { CreateWorkspace } from "./create-workspace";
import { RealtimeProvider } from "./realtime";
import { SessionProvider, useSessionQuery } from "./session";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session, error, mutate, isLoading } = useSessionQuery();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

  if (isLoading || (!session && !error)) {
    return (
      <div className="flex min-h-dvh" role="status" aria-label="Loading dashboard">
        <div className="hidden w-60 border-r border-border p-3 md:block">
          <Skeleton className="h-10 w-full" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-7 w-full" />)}
          </div>
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-8 h-40 w-full" />
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <ErrorState message={errorMessage(error)} onRetry={() => void mutate()} />
      </div>
    );
  }

  // Signed in but not in any workspace (e.g. removed from the last one).
  if (!session.organization) {
    return (
      <SessionProvider session={session} mutate={mutate}>
        <CreateWorkspace firstTime />
      </SessionProvider>
    );
  }

  return (
    <SessionProvider session={session} mutate={mutate}>
      <RealtimeProvider orgId={session.organization.id}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
        >
          Skip to content
        </a>
        <div className="flex min-h-dvh">
          <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-bg md:block">
            <Sidebar />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/90 px-2 backdrop-blur md:hidden">
              <D.Root open={menuOpen} onOpenChange={setMenuOpen}>
                <D.Trigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open navigation">
                    <Menu aria-hidden />
                  </Button>
                </D.Trigger>
                <D.Portal>
                  <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
                  <D.Content className="fixed inset-y-0 left-0 z-50 w-[min(300px,86vw)] border-r border-border bg-bg shadow-lg">
                    <D.Title className="sr-only">Navigation</D.Title>
                    <D.Description className="sr-only">Dashboard sections and account</D.Description>
                    <D.Close asChild>
                      <Button variant="ghost" size="icon" className="absolute right-2 top-2 z-10" aria-label="Close navigation">
                        <X aria-hidden />
                      </Button>
                    </D.Close>
                    <div className="h-full pt-2">
                      <Sidebar onNavigate={() => setMenuOpen(false)} />
                    </div>
                  </D.Content>
                </D.Portal>
              </D.Root>
              <Logo />
            </header>
            <main id="main" className="min-w-0 flex-1">
              {children}
            </main>
          </div>
        </div>
      </RealtimeProvider>
    </SessionProvider>
  );
}
