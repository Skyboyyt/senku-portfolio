import type { WidgetBootstrapDto, WidgetEvent, WidgetMessageDto, WidgetSessionDto } from "@supportflow/shared";
import { h, icon, ICONS, linkify, readableTextColor } from "./dom";
import { STYLES } from "./styles";

export interface WidgetOptions {
  key: string;
  apiUrl: string;
  mode: "launcher" | "inline";
  /** Inline mode: the element to render into. */
  target?: HTMLElement;
  /** Launcher mode: start open. */
  open?: boolean;
}

export interface WidgetDeps {
  fetch: typeof fetch;
  WebSocket: typeof WebSocket | null;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
}

type Config = WidgetBootstrapDto["config"];
type Conversation = NonNullable<WidgetSessionDto["conversation"]>;

class WidgetError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class SupportFlowWidget {
  private config: Config | null = null;
  private token: string | null = null;
  private conversation: Conversation | null = null;
  private messages: WidgetMessageDto[] = [];
  private typing = false;
  private sessionLoaded = false;
  private sending = false;
  private error: string | null = null;
  private socket: WebSocket | null = null;
  private socketRetries = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isOpen = false;
  private destroyed = false;

  private host!: HTMLElement;
  private root!: ShadowRoot;
  private wrapper!: HTMLDivElement;
  private panel!: HTMLDivElement;
  private log!: HTMLDivElement;
  private actions!: HTMLDivElement;
  private identity!: HTMLDivElement;
  private errorEl!: HTMLParagraphElement;
  private textarea!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private launcher: HTMLButtonElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private emailInput: HTMLInputElement | null = null;
  private honeypot!: HTMLInputElement;

  constructor(
    private readonly options: WidgetOptions,
    private readonly deps: WidgetDeps,
  ) {}

  private get storageKey() {
    return `supportflow:${this.options.key}:visitor`;
  }

  private url(path: string) {
    return `${this.options.apiUrl}/public/widget/${encodeURIComponent(this.options.key)}${path}`;
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.token) headers["X-Visitor-Token"] = this.token;
    const res = await this.deps.fetch(this.url(path), {
      method: body !== undefined ? "POST" : "GET",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Never send the host page's cookies to SupportFlow.
      credentials: "omit",
      mode: "cors",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
    if (!res.ok) throw new WidgetError(data.error?.message ?? "Something went wrong. Please try again.", res.status);
    return data;
  }

  async mount(): Promise<void> {
    const bootstrap = await this.request<WidgetBootstrapDto>("/bootstrap");
    this.config = bootstrap.config;
    try {
      this.token = this.deps.storage?.getItem(this.storageKey) ?? null;
    } catch {
      this.token = null;
    }
    this.render();
    if (this.options.mode === "inline" || this.options.open) await this.open();
  }

  private render() {
    const config = this.config!;
    const inline = this.options.mode === "inline";
    this.host = inline && this.options.target ? this.options.target : h("div", { "data-supportflow": "" });
    if (!inline) document.body.append(this.host);
    this.root = this.host.attachShadow({ mode: "open" });
    const style = h("style");
    style.textContent = STYLES;

    this.wrapper = h("div", { class: `sf ${inline ? "inline" : `sf-floating ${config.position}`}` });
    this.wrapper.style.setProperty("--sf-brand", config.brandColor);
    this.wrapper.style.setProperty("--sf-brand-fg", readableTextColor(config.brandColor));
    if (inline) this.wrapper.style.height = "100%";

    const titleId = `sf-title-${Math.random().toString(36).slice(2, 8)}`;
    const closeButton = inline
      ? null
      : h("button", { class: "icon-btn", type: "button", "aria-label": "Close chat", onclick: () => this.close() }, icon(ICONS.close));
    const header = h(
      "div",
      { class: "header" },
      h(
        "div",
        { class: "titles" },
        h("h2", { id: titleId }, config.title),
        h("p", {}, config.aiEnabled ? "AI assistant · a person can take over any time" : "We reply here as soon as we can"),
      ),
      closeButton,
    );

    this.log = h("div", { class: "log", role: "log", "aria-live": "polite", "aria-relevant": "additions", tabindex: "0", "aria-label": "Conversation" });
    this.actions = h("div", { class: "actions" });
    this.identity = h("div", { class: "identity" });
    this.errorEl = h("p", { class: "error", role: "alert", hidden: true });
    this.textarea = h("textarea", {
      rows: 1,
      placeholder: "Write a message…",
      "aria-label": "Message",
      maxlength: 2000,
      onkeydown: (e: Event) => {
        const event = e as KeyboardEvent;
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          void this.send();
        }
      },
      oninput: () => this.autosize(),
    });
    this.sendButton = h("button", { class: "send", type: "submit", "aria-label": "Send message" }, icon(ICONS.send));
    this.honeypot = h("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
    const form = h(
      "form",
      {
        class: "compose",
        onsubmit: (e: Event) => {
          e.preventDefault();
          void this.send();
        },
      },
      h("div", { class: "hp", "aria-hidden": "true" }, this.honeypot),
      this.textarea,
      this.sendButton,
    );
    const branding = config.showBranding
      ? h("div", { class: "branding" }, "Powered by ", h("a", { href: "https://supportflow.app", target: "_blank", rel: "noopener noreferrer" }, "SupportFlow"))
      : null;
    const footer = h("div", { class: "footer" }, this.actions, this.identity, this.errorEl, form, branding);

    this.panel = h("div", {
      class: "panel",
      role: inline ? "region" : "dialog",
      "aria-labelledby": titleId,
      hidden: !inline,
      onkeydown: (e: Event) => {
        if ((e as KeyboardEvent).key === "Escape" && !inline) this.close();
      },
    });
    this.panel.append(header, this.log, footer);
    this.wrapper.append(this.panel);

    if (!inline) {
      this.launcher = h(
        "button",
        { class: "launcher", type: "button", "aria-expanded": "false", "aria-haspopup": "dialog", onclick: () => (this.isOpen ? this.close() : void this.open()) },
        icon(ICONS.chat),
        config.launcherLabel,
      );
      this.wrapper.append(this.launcher);
    }
    this.root.append(style, this.wrapper);
    this.renderMessages();
  }

  async open(): Promise<void> {
    this.isOpen = true;
    this.panel.hidden = false;
    this.launcher?.setAttribute("aria-expanded", "true");
    if (!this.sessionLoaded) await this.loadSession();
    if (this.options.mode !== "inline") this.textarea.focus();
    this.connect();
  }

  close(): void {
    if (this.options.mode === "inline") return;
    this.isOpen = false;
    this.panel.hidden = true;
    this.launcher?.setAttribute("aria-expanded", "false");
    this.launcher?.focus();
    this.stopPolling();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else void this.open();
  }

  private async loadSession() {
    try {
      const session = await this.request<WidgetSessionDto>("/session", {});
      this.token = session.visitorToken;
      try {
        this.deps.storage?.setItem(this.storageKey, session.visitorToken);
      } catch {
        // Storage blocked (private mode): the conversation lasts for this page view.
      }
      this.conversation = session.conversation;
      this.messages = session.messages;
      this.sessionLoaded = true;
      this.setError(null);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : "Chat is unavailable right now.");
    }
    this.renderMessages();
  }

  private async send() {
    const body = this.textarea.value.trim();
    if (!body || this.sending) return;
    if (!this.sessionLoaded) await this.loadSession();
    const needsIdentity = !this.conversation && this.config?.requireEmail;
    const email = this.emailInput?.value.trim() ?? "";
    if (needsIdentity && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.setError("Please enter a valid email so we can reply.");
      this.emailInput?.focus();
      return;
    }
    this.sending = true;
    this.sendButton.disabled = true;
    try {
      const result = await this.request<{ conversationId: string; message: WidgetMessageDto }>("/messages", {
        body,
        website: this.honeypot.value,
        ...(needsIdentity ? { email, name: this.nameInput?.value.trim() || undefined } : {}),
      });
      this.textarea.value = "";
      this.autosize();
      this.setError(null);
      if (!this.conversation || this.conversation.id !== result.conversationId) {
        this.conversation = { id: result.conversationId, status: "open", humanRequested: false, csatRating: null };
        this.disconnect();
      }
      if (this.conversation.status === "resolved") this.conversation.status = "open";
      this.addMessage(result.message);
      this.connect();
    } catch (error) {
      this.setError(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally {
      this.sending = false;
      this.sendButton.disabled = false;
      this.textarea.focus();
    }
  }

  private async requestHuman() {
    try {
      await this.request("/handoff", {});
      if (this.conversation) this.conversation.humanRequested = true;
      this.renderActions();
    } catch (error) {
      this.setError(error instanceof Error ? error.message : "Couldn't reach the team.");
    }
  }

  private async rate(rating: number) {
    try {
      await this.request("/csat", { rating });
      if (this.conversation) this.conversation.csatRating = rating;
      this.renderMessages();
    } catch (error) {
      this.setError(error instanceof Error ? error.message : "Couldn't save your rating.");
    }
  }

  private addMessage(message: WidgetMessageDto) {
    if (this.messages.some((m) => m.id === message.id)) return;
    this.messages.push(message);
    if (message.authorType !== "customer") this.typing = false;
    this.renderMessages();
  }

  private handleEvent(event: WidgetEvent) {
    if (event.type === "message") this.addMessage(event.message);
    else if (event.type === "typing") {
      this.typing = event.active;
      this.renderMessages();
    } else if (event.type === "status" && this.conversation) {
      this.conversation.status = event.status;
      this.conversation.humanRequested = event.humanRequested || this.conversation.humanRequested;
      this.renderMessages();
    }
  }

  private connect() {
    if (this.socket || !this.conversation || !this.token || this.destroyed) return;
    const WS = this.deps.WebSocket;
    if (!WS) {
      this.startPolling();
      return;
    }
    const wsUrl = `${this.url("/ws").replace(/^http/, "ws")}?token=${encodeURIComponent(this.token)}&conversationId=${encodeURIComponent(this.conversation.id)}`;
    const socket = new WS(wsUrl);
    this.socket = socket;
    socket.onopen = () => {
      this.socketRetries = 0;
      this.stopPolling();
    };
    socket.onmessage = (e) => {
      try {
        this.handleEvent(JSON.parse(String(e.data)) as WidgetEvent);
      } catch {
        // Ignore malformed frames.
      }
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (this.destroyed) return;
      // Fall back to polling while the socket is down, and retry with backoff.
      this.startPolling();
      const delay = Math.min(30_000, 1000 * 2 ** this.socketRetries++);
      setTimeout(() => this.connect(), delay);
    };
  }

  private disconnect() {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private startPolling() {
    if (this.pollTimer || (!this.isOpen && this.options.mode !== "inline")) return;
    this.pollTimer = setInterval(async () => {
      try {
        const session = await this.request<WidgetSessionDto>("/session", {});
        this.conversation = session.conversation;
        for (const m of session.messages) this.addMessage(m);
      } catch {
        // Keep the last state; the next tick retries.
      }
    }, 5000);
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private setError(message: string | null) {
    this.error = message;
    if (!this.errorEl) return;
    this.errorEl.textContent = message ?? "";
    this.errorEl.hidden = !message;
  }

  private autosize() {
    this.textarea.style.height = "auto";
    this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 120)}px`;
  }

  private renderActions() {
    const config = this.config!;
    this.actions.replaceChildren();
    const conv = this.conversation;
    if (config.aiEnabled && conv && conv.status !== "resolved" && !conv.humanRequested) {
      this.actions.append(h("button", { type: "button", class: "link-btn", onclick: () => void this.requestHuman() }, "Talk to a person"));
    }
    this.identity.replaceChildren();
    if (!conv && config.requireEmail) {
      this.emailInput ??= h("input", { type: "email", autocomplete: "email", required: true, maxlength: 254 });
      this.nameInput ??= h("input", { type: "text", autocomplete: "name", maxlength: 80 });
      this.identity.append(
        h("label", {}, "Email (so we can reply)", this.emailInput),
        h("label", {}, "Name (optional)", this.nameInput),
      );
    }
  }

  private renderMessages() {
    if (!this.log) return;
    const config = this.config!;
    const nearBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 80;
    this.log.replaceChildren();
    this.log.append(h("div", { class: "greeting" }, config.greeting));
    for (const m of this.messages) {
      const row = h("div", { class: `row ${m.authorType}` });
      if (m.authorType === "ai") {
        row.append(h("div", { class: "meta" }, h("span", { class: "tag" }, "AI"), m.authorName ?? "AI assistant"));
      } else if (m.authorType === "agent") {
        row.append(h("div", { class: "meta" }, m.authorName ?? "Support"));
      }
      const bubble = h("div", { class: "bubble" });
      bubble.append(linkify(m.body));
      row.append(bubble);
      this.log.append(row);
    }
    if (this.typing) {
      this.log.append(h("div", { class: "typing", role: "status", "aria-label": "Assistant is typing" }, h("span"), h("span"), h("span")));
    }
    const conv = this.conversation;
    if (conv?.status === "resolved" && config.collectCsat) {
      if (conv.csatRating === null) {
        const stars = h("div", { class: "stars", role: "group", "aria-label": "Rate this conversation from 1 to 5" });
        for (let r = 1; r <= 5; r++) {
          stars.append(h("button", { type: "button", "aria-label": `${r} out of 5`, onclick: () => void this.rate(r) }, String(r)));
        }
        this.log.append(h("div", { class: "csat" }, h("p", {}, "How did we do?"), stars));
      } else {
        this.log.append(h("div", { class: "row system" }, h("div", { class: "bubble" }, "Thanks for your feedback.")));
      }
    }
    this.renderActions();
    if (nearBottom || this.messages.at(-1)?.authorType === "customer") this.log.scrollTop = this.log.scrollHeight;
  }

  destroy(): void {
    this.destroyed = true;
    this.disconnect();
    this.stopPolling();
    if (this.options.mode !== "inline") this.host?.remove();
    else this.root?.replaceChildren();
  }

  /** For tests. */
  get state() {
    return { config: this.config, conversation: this.conversation, messages: this.messages, error: this.error, token: this.token };
  }

  get shadow(): ShadowRoot {
    return this.root;
  }
}
