type Attrs = Record<string, string | boolean | number | undefined | null | ((event: Event) => void)>;

/**
 * Minimal element builder. Text is always set with textContent, never innerHTML, so
 * message content from customers, agents or the AI can't inject markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (typeof value === "function") el.addEventListener(key.replace(/^on/, "").toLowerCase(), value);
    else if (key === "class") el.className = String(value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

/** Renders text with http(s) URLs turned into safe links. Everything else stays plain text. */
export function linkify(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0].replace(/[.,;:!?]+$/, "");
    const index = match.index ?? 0;
    if (index > last) fragment.append(document.createTextNode(text.slice(last, index)));
    let href: string | null = null;
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") href = url.href;
    } catch {
      href = null;
    }
    if (href) {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer nofollow";
      a.textContent = raw;
      fragment.append(a);
    } else {
      fragment.append(document.createTextNode(raw));
    }
    last = index + raw.length;
  }
  if (last < text.length) fragment.append(document.createTextNode(text.slice(last)));
  return fragment;
}

/** Black or white text for a background colour, using WCAG relative luminance. */
export function readableTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  // Contrast against white vs. near-black; pick the higher.
  return (1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? "#ffffff" : "#111111");
}

export const ICONS = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.4A8 8 0 1 1 21 12Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 14-7-4 14-3-6-7-1Z"/></svg>',
};

/** Static, trusted SVG markup only. */
export function icon(svg: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.style.display = "contents";
  span.innerHTML = svg;
  return span;
}
