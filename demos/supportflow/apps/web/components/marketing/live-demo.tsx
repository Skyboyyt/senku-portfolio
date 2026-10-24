"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL, DEMO_WIDGET_KEY } from "@/lib/site";

/**
 * Runs the real SupportFlow widget, inline, against the isolated demo workspace
 * (a fictional coffee roaster). Nothing here touches customer data.
 */
export function LiveDemo() {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(DEMO_WIDGET_KEY ? "loading" : "error");

  useEffect(() => {
    const host = container.current;
    if (!host || !DEMO_WIDGET_KEY) return;
    // A fresh mount point each time, because a shadow root can only be attached once.
    const mount = document.createElement("div");
    mount.id = `sf-demo-${Math.random().toString(36).slice(2, 8)}`;
    mount.style.height = "100%";
    host.replaceChildren(mount);
    const script = document.createElement("script");
    script.src = `${API_URL}/widget.js`;
    script.async = true;
    script.dataset.key = DEMO_WIDGET_KEY;
    script.dataset.mode = "inline";
    script.dataset.target = `#${mount.id}`;
    const onReady = () => setStatus("ready");
    const onError = () => setStatus("error");
    script.addEventListener("supportflow:ready", onReady);
    script.addEventListener("supportflow:error", onError);
    script.addEventListener("error", onError);
    document.body.append(script);
    return () => {
      script.remove();
      host.replaceChildren();
    };
  }, []);

  return (
    <div className="relative h-[520px] overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
      <div ref={container} className="h-full" />
      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
          {status === "loading" ? (
            <p className="text-sm text-muted" role="status">
              Starting the demo chat…
            </p>
          ) : (
            <div className="max-w-xs">
              <p className="text-sm font-medium text-text">The live demo isn&apos;t available right now</p>
              <p className="mt-1 text-sm text-muted">
                You can still create a free workspace and try the chat from your own dashboard.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
