"use client";

import { useEffect, useRef, useState } from "react";

/** Renders the real widget inline. Remounts when `version` changes so saved settings show. */
export function WidgetPreview({ scriptUrl, publicKey, version }: { scriptUrl: string; publicKey: string; version: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setState("loading");
    const mount = document.createElement("div");
    mount.id = `sf-preview-${Math.random().toString(36).slice(2, 8)}`;
    mount.style.height = "100%";
    el.replaceChildren(mount);
    const script = document.createElement("script");
    // Cache-bust so the preview reflects the latest saved configuration.
    script.src = `${scriptUrl}?v=${version}`;
    script.async = true;
    script.dataset.key = publicKey;
    script.dataset.mode = "inline";
    script.dataset.target = `#${mount.id}`;
    script.addEventListener("supportflow:ready", () => setState("ready"));
    script.addEventListener("supportflow:error", () => setState("error"));
    script.addEventListener("error", () => setState("error"));
    document.body.append(script);
    return () => {
      script.remove();
      el.replaceChildren();
    };
  }, [scriptUrl, publicKey, version]);

  return (
    <div className="relative h-[540px] overflow-hidden rounded-lg border border-border">
      <div ref={host} className="h-full" />
      {state !== "ready" && (
        <p className="absolute inset-0 grid place-items-center bg-surface px-6 text-center text-sm text-muted" role="status">
          {state === "loading" ? "Loading preview…" : "The preview couldn't load. Check that the widget is enabled and the API is reachable."}
        </p>
      )}
    </div>
  );
}
