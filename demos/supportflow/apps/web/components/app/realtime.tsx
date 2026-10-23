"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSWRConfig } from "swr";
import type { RealtimeEvent } from "@supportflow/shared";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/site";

type Status = "connecting" | "live" | "offline";
type Listener = (event: RealtimeEvent) => void;

interface RealtimeContextValue {
  status: Status;
  subscribe: (listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({ status: "offline", subscribe: () => () => {} });

/**
 * One WebSocket per dashboard tab. Events revalidate the matching SWR caches, so lists and
 * open conversations update without polling. Reconnects with backoff; while offline,
 * SWR's focus revalidation keeps data fresh.
 */
export function RealtimeProvider({ orgId, children }: { orgId: string; children: ReactNode }) {
  const { mutate } = useSWRConfig();
  const [status, setStatus] = useState<Status>("connecting");
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const revalidate = (event: RealtimeEvent) => {
      if (event.type === "ticket.updated") {
        void mutate((key) => typeof key === "string" && (key.startsWith("/tickets") || key.startsWith("$inf$/tickets")));
        void mutate("/analytics/overview?days=30");
        return;
      }
      // List pages use useSWRInfinite, whose cache keys carry a "$inf$" prefix.
      void mutate(
        (key) =>
          typeof key === "string" &&
          (key.startsWith("/conversations?") || key.startsWith("$inf$/conversations?") || key === "/conversations/counts"),
      );
      void mutate(`/conversations/${event.conversationId}`);
    };

    const connect = async () => {
      if (stopped) return;
      setStatus((s) => (s === "live" ? s : "connecting"));
      try {
        const { ticket } = await api<{ ticket: string }>("/realtime/ticket", { body: {} });
        if (stopped) return;
        socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/realtime?ticket=${encodeURIComponent(ticket)}`);
        socket.onmessage = (message) => {
          let event: RealtimeEvent | { type: "ready" };
          try {
            event = JSON.parse(String(message.data));
          } catch {
            return;
          }
          if (event.type === "ready") {
            retry = 0;
            setStatus("live");
            return;
          }
          revalidate(event);
          for (const listener of listeners.current) listener(event);
        };
        socket.onclose = () => {
          socket = null;
          if (stopped) return;
          setStatus("offline");
          schedule();
        };
      } catch {
        setStatus("offline");
        schedule();
      }
    };
    const schedule = () => {
      timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
    };
    void connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [orgId, mutate]);

  const subscribe = (listener: Listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  };

  return <RealtimeContext.Provider value={{ status, subscribe }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
