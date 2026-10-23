"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { roleAtLeast, type Role, type SessionDto } from "@supportflow/shared";
import { ApiError } from "@/lib/api";

interface SessionContextValue {
  session: SessionDto;
  mutate: KeyedMutator<SessionDto>;
  /** True when the user's role in the active workspace is at least `role`. */
  can: (role: Role) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSessionQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSWR<SessionDto>("/auth/session", { revalidateOnFocus: true });
  useEffect(() => {
    // Act only on a settled 401, not a stale cached one that is being re-checked.
    if (query.error instanceof ApiError && query.error.status === 401 && !query.isValidating) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [query.error, query.isValidating, router, pathname]);
  return query;
}

export function SessionProvider({ session, mutate, children }: { session: SessionDto; mutate: KeyedMutator<SessionDto>; children: ReactNode }) {
  const can = (role: Role) => (session.role ? roleAtLeast(session.role, role) : false);
  return <SessionContext.Provider value={{ session, mutate, can }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside the dashboard");
  return ctx;
}
