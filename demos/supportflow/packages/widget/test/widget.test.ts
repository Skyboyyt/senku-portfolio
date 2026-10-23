import { afterEach, describe, expect, it, vi } from "vitest";
import { linkify, readableTextColor } from "../src/dom";
import { SupportFlowWidget, type WidgetDeps } from "../src/widget";

const CONFIG = {
  title: "Acme Help",
  greeting: "Hi there",
  brandColor: "#165C4F",
  launcherLabel: "Chat",
  position: "right" as const,
  requireEmail: false,
  showBranding: true,
  aiEnabled: true,
  collectCsat: true,
};

function fakeApi(overrides: Partial<typeof CONFIG> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/bootstrap")) return Response.json({ config: { ...CONFIG, ...overrides } });
    if (url.endsWith("/session")) return Response.json({ visitorToken: "visitor-token-abcdefghijklmnop", conversation: null, messages: [] });
    if (url.endsWith("/messages")) {
      const body = JSON.parse(String(init.body)) as { body: string };
      return Response.json(
        { conversationId: "00000000-0000-4000-8000-000000000001", message: { id: "m1", authorType: "customer", authorName: null, body: body.body, createdAt: new Date().toISOString() } },
        { status: 201 },
      );
    }
    return Response.json({ error: { message: "nope" } }, { status: 404 });
  });
  return { calls, fetch: fetchImpl as unknown as typeof fetch };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("rendering helpers", () => {
  it("renders markup in messages as text, never HTML", () => {
    const fragment = linkify('<img src=x onerror="alert(1)"> hello');
    const div = document.createElement("div");
    div.append(fragment);
    expect(div.querySelector("img")).toBeNull();
    expect(div.textContent).toBe('<img src=x onerror="alert(1)"> hello');
  });

  it("links only http(s) URLs, opening safely in a new tab", () => {
    const div = document.createElement("div");
    div.append(linkify("See https://help.example.com/returns. Or javascript:alert(1)"));
    const links = div.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("https://help.example.com/returns");
    expect(links[0]!.rel).toContain("noopener");
    expect(div.textContent).toContain("javascript:alert(1)");
  });

  it("chooses readable text on brand colours", () => {
    expect(readableTextColor("#165C4F")).toBe("#ffffff");
    expect(readableTextColor("#F5D547")).toBe("#111111");
    expect(readableTextColor("bogus")).toBe("#ffffff");
  });
});

describe("widget flow", () => {
  const deps = (api: ReturnType<typeof fakeApi>, storage = memoryStorage()): WidgetDeps => ({ fetch: api.fetch, WebSocket: null, storage });

  it("mounts a launcher in a shadow root and opens on click", async () => {
    const api = fakeApi();
    const widget = new SupportFlowWidget({ key: "pk_test_123456789", apiUrl: "https://api.test", mode: "launcher" }, deps(api));
    await widget.mount();
    const launcher = widget.shadow.querySelector<HTMLButtonElement>(".launcher")!;
    expect(launcher.textContent).toContain("Chat");
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(widget.shadow.querySelector(".panel")!.hasAttribute("hidden")).toBe(true);
    launcher.click();
    await vi.waitFor(() => expect(launcher.getAttribute("aria-expanded")).toBe("true"));
    expect(widget.shadow.querySelector(".greeting")!.textContent).toBe("Hi there");
    expect(api.calls.every((c) => c.init.credentials === "omit" || c.init.credentials === undefined)).toBe(true);
    widget.destroy();
  });

  it("sends a message with the visitor token and stores the token", async () => {
    const api = fakeApi();
    const storage = memoryStorage();
    const widget = new SupportFlowWidget({ key: "pk_test_123456789", apiUrl: "https://api.test", mode: "launcher" }, deps(api, storage));
    await widget.mount();
    await widget.open();
    const textarea = widget.shadow.querySelector("textarea")!;
    textarea.value = "<b>Where</b> is my order?";
    widget.shadow.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(widget.state.messages).toHaveLength(1));
    const send = api.calls.find((c) => c.url.endsWith("/messages"))!;
    expect((send.init.headers as Record<string, string>)["X-Visitor-Token"]).toBe("visitor-token-abcdefghijklmnop");
    expect(storage.map.get("supportflow:pk_test_123456789:visitor")).toBe("visitor-token-abcdefghijklmnop");
    const bubble = widget.shadow.querySelector(".row.customer .bubble")!;
    expect(bubble.querySelector("b")).toBeNull();
    expect(bubble.textContent).toBe("<b>Where</b> is my order?");
    widget.destroy();
  });

  it("asks for an email first when required", async () => {
    const api = fakeApi({ requireEmail: true });
    const widget = new SupportFlowWidget({ key: "pk_test_123456789", apiUrl: "https://api.test", mode: "launcher" }, deps(api));
    await widget.mount();
    await widget.open();
    widget.shadow.querySelector("textarea")!.value = "Hello";
    widget.shadow.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(widget.state.error).toMatch(/email/));
    expect(api.calls.some((c) => c.url.endsWith("/messages"))).toBe(false);
  });

  it("works when storage is blocked", async () => {
    const api = fakeApi();
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const widget = new SupportFlowWidget({ key: "pk_test_123456789", apiUrl: "https://api.test", mode: "launcher" }, { fetch: api.fetch, WebSocket: null, storage: blocked });
    await widget.mount();
    await widget.open();
    expect(widget.state.token).toBe("visitor-token-abcdefghijklmnop");
    widget.destroy();
  });

  it("renders inline into a target element", async () => {
    const api = fakeApi();
    const target = document.createElement("div");
    document.body.append(target);
    const widget = new SupportFlowWidget({ key: "pk_test_123456789", apiUrl: "https://api.test", mode: "inline", target }, deps(api));
    await widget.mount();
    expect(target.shadowRoot!.querySelector(".launcher")).toBeNull();
    expect(target.shadowRoot!.querySelector(".panel")!.hasAttribute("hidden")).toBe(false);
  });

  it("surfaces startup failures (e.g. site not allowed)", async () => {
    const fetchImpl = (async () => Response.json({ error: { message: "This website is not allowed" } }, { status: 403 })) as unknown as typeof fetch;
    const widget = new SupportFlowWidget({ key: "pk_test_123456789", apiUrl: "https://api.test", mode: "launcher" }, { fetch: fetchImpl, WebSocket: null, storage: null });
    await expect(widget.mount()).rejects.toThrow(/not allowed/);
    expect(document.querySelector("[data-supportflow]")).toBeNull();
  });
});
