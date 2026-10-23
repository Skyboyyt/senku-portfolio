/** Styles live inside the widget's shadow root, so host-page CSS can't leak in or out. */
export const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.sf {
  --sf-bg: #ffffff; --sf-surface: #f4f2ed; --sf-border: #e3e0d8; --sf-text: #1b1a17; --sf-muted: #5c5850;
  --sf-ai: #855600; --sf-ai-soft: #fbf0d8; --sf-danger: #b42318;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px; line-height: 1.45; color: var(--sf-text);
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .sf { --sf-bg: #181b19; --sf-surface: #222623; --sf-border: #323833; --sf-text: #ecede8; --sf-muted: #a8aca2;
        --sf-ai: #e8b85c; --sf-ai-soft: #352a12; --sf-danger: #f28a7f; }
}
.sf-floating { position: fixed; bottom: 20px; z-index: 2147483000; }
.sf-floating.right { right: 20px; } .sf-floating.left { left: 20px; }
.launcher {
  display: inline-flex; align-items: center; gap: 8px; height: 48px; padding: 0 18px; border: 0; border-radius: 999px;
  background: var(--sf-brand); color: var(--sf-brand-fg); font: 600 14px/1 inherit; font-family: inherit; cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,.08), 0 10px 24px -8px rgba(0,0,0,.35); transition: transform .15s ease;
}
.launcher:hover { transform: translateY(-1px); }
.launcher:active { transform: scale(.98); }
.launcher svg { width: 18px; height: 18px; }
button:focus-visible, textarea:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--sf-brand); outline-offset: 2px; }
.panel {
  display: flex; flex-direction: column; background: var(--sf-bg); border: 1px solid var(--sf-border); border-radius: 14px; overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,.06), 0 24px 48px -16px rgba(0,0,0,.35);
}
.sf-floating .panel { position: absolute; bottom: 64px; width: 380px; height: min(620px, calc(100dvh - 110px)); }
.sf-floating.right .panel { right: 0; } .sf-floating.left .panel { left: 0; }
.panel[hidden] { display: none; }
@media (max-width: 480px) {
  .sf-floating .panel { position: fixed; inset: 0; width: auto; height: auto; bottom: 0; border-radius: 0; border: 0; }
}
.inline .panel { width: 100%; height: 100%; min-height: 420px; box-shadow: none; }
.header { display: flex; align-items: center; gap: 10px; padding: 14px 14px 12px 16px; background: var(--sf-brand); color: var(--sf-brand-fg); }
.header h2 { margin: 0; font-size: 15px; font-weight: 600; }
.header p { margin: 2px 0 0; font-size: 12px; opacity: .85; }
.header .titles { flex: 1; min-width: 0; }
.icon-btn { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
.icon-btn:hover { background: rgba(255,255,255,.14); }
.icon-btn svg { width: 18px; height: 18px; }
.log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: var(--sf-bg); }
.row { display: flex; flex-direction: column; max-width: 86%; }
.row.customer { align-self: flex-end; align-items: flex-end; }
.row.system { align-self: center; max-width: 92%; }
.bubble { padding: 9px 12px; border-radius: 12px; white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere; }
.customer .bubble { background: var(--sf-brand); color: var(--sf-brand-fg); border-bottom-right-radius: 4px; }
.agent .bubble, .ai .bubble { background: var(--sf-surface); border-bottom-left-radius: 4px; }
.ai .bubble { border: 1px solid color-mix(in srgb, var(--sf-ai) 30%, transparent); }
.system .bubble { background: transparent; color: var(--sf-muted); font-size: 12.5px; text-align: center; padding: 2px 8px; }
.bubble a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.meta { display: flex; align-items: center; gap: 6px; margin: 0 4px 3px; font-size: 11.5px; color: var(--sf-muted); }
.tag { display: inline-block; padding: 0 6px; border-radius: 999px; background: var(--sf-ai-soft); color: var(--sf-ai); font-size: 10.5px; font-weight: 600; letter-spacing: .02em; }
.greeting { color: var(--sf-muted); font-size: 13.5px; padding: 2px 2px 6px; }
.typing { align-self: flex-start; display: flex; gap: 4px; padding: 12px; border-radius: 12px; background: var(--sf-surface); }
.typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--sf-muted); opacity: .5; animation: sf-dot 1.2s infinite; }
.typing span:nth-child(2) { animation-delay: .15s; } .typing span:nth-child(3) { animation-delay: .3s; }
@keyframes sf-dot { 50% { opacity: 1; transform: translateY(-2px); } }
@media (prefers-reduced-motion: reduce) { .typing span { animation: none; } .launcher { transition: none; } }
.footer { border-top: 1px solid var(--sf-border); padding: 10px 12px 12px; background: var(--sf-bg); }
.actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; min-height: 0; }
.actions:empty { display: none; }
.link-btn { border: 0; background: none; padding: 6px 2px; min-height: 32px; color: var(--sf-muted); font: inherit; font-size: 12.5px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.link-btn:hover { color: var(--sf-text); }
form.compose { display: flex; gap: 8px; align-items: flex-end; }
textarea, input {
  flex: 1; width: 100%; resize: none; border: 1px solid var(--sf-border); border-radius: 10px; padding: 10px 12px; background: var(--sf-bg);
  color: var(--sf-text); font: inherit; font-size: 16px; line-height: 1.4; max-height: 120px;
}
@media (min-width: 481px) { textarea, input { font-size: 14px; } }
.send { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 10px; background: var(--sf-brand); color: var(--sf-brand-fg); cursor: pointer; }
.send:disabled { opacity: .5; cursor: not-allowed; }
.send svg { width: 18px; height: 18px; }
.identity { display: grid; gap: 8px; margin-bottom: 8px; }
.identity label { font-size: 12px; color: var(--sf-muted); display: grid; gap: 4px; }
.error { color: var(--sf-danger); font-size: 12.5px; margin: 0 0 8px; }
.csat { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--sf-border); border-radius: 12px; align-self: stretch; text-align: center; }
.csat p { margin: 0; font-size: 13px; }
.stars { display: flex; justify-content: center; gap: 6px; }
.stars button { width: 40px; height: 40px; border: 1px solid var(--sf-border); border-radius: 8px; background: var(--sf-bg); color: var(--sf-text); font: inherit; font-weight: 600; cursor: pointer; }
.stars button:hover { border-color: var(--sf-brand); }
.branding { margin-top: 8px; text-align: center; font-size: 11px; color: var(--sf-muted); }
.branding a { color: inherit; }
.hp { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
.sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
`;
