import { SupportFlowWidget } from "./widget";

/**
 * Embed:
 *   <script src="https://API_HOST/widget.js" data-key="pk_..." async></script>
 * Inline (renders inside an element instead of a floating launcher):
 *   <div id="chat"></div>
 *   <script src="https://API_HOST/widget.js" data-key="pk_..." data-mode="inline" data-target="#chat" async></script>
 * The page can control the floating widget with window.SupportFlow.open() / .close() / .toggle().
 */
declare global {
  interface Window {
    SupportFlow?: { open: () => void; close: () => void; toggle: () => void; destroy: () => void };
  }
}

function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = "__sf_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function start(script: HTMLScriptElement) {
  // A script tag removed before it ran (for example by a re-rendering app) does nothing.
  if (!script.isConnected) return;
  const key = script.dataset.key;
  if (!key) {
    console.error("SupportFlow: add data-key to the widget script tag.");
    return;
  }
  const apiUrl = (script.dataset.api ?? new URL(script.src).origin).replace(/\/$/, "");
  const mode = script.dataset.mode === "inline" ? "inline" : "launcher";
  const target = script.dataset.target ? document.querySelector<HTMLElement>(script.dataset.target) : null;
  if (mode === "inline" && !target) {
    console.error("SupportFlow: data-target must point to an element for inline mode.");
    return;
  }
  const widget = new SupportFlowWidget(
    { key, apiUrl, mode, target: target ?? undefined, open: script.dataset.open === "true" },
    { fetch: window.fetch.bind(window), WebSocket: window.WebSocket ?? null, storage: safeStorage() },
  );
  widget
    .mount()
    .then(() => {
      if (mode === "launcher") {
        window.SupportFlow = {
          open: () => void widget.open(),
          close: () => widget.close(),
          toggle: () => widget.toggle(),
          destroy: () => widget.destroy(),
        };
      }
      script.dispatchEvent(new CustomEvent("supportflow:ready", { bubbles: true }));
    })
    .catch((error: unknown) => {
      // A widget that can't start (wrong key, site not allowed) stays out of the page.
      console.warn("SupportFlow chat could not start:", error instanceof Error ? error.message : error);
      script.dispatchEvent(new CustomEvent("supportflow:error", { bubbles: true, detail: String(error) }));
    });
}

const current = document.currentScript as HTMLScriptElement | null;
if (current) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => start(current));
  else start(current);
}

export { SupportFlowWidget };
