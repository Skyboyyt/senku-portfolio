import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatPrice,
  getPlan,
  originSchema,
  preview,
  registerSchema,
  roleAtLeast,
  slugify,
  widgetMessageSchema,
} from "../src";

describe("formatting", () => {
  it("formats durations compactly", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(720)).toBe("12m");
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe("3h 20m");
    expect(formatDuration(2 * 86400 + 4 * 3600)).toBe("2d 4h");
  });
  it("slugifies text safely", () => {
    expect(slugify("Shipping & Returns — Europe!")).toBe("shipping-returns-europe");
    expect(slugify("Café crème")).toBe("cafe-creme");
    expect(slugify("!!!")).toBe("item");
  });
  it("previews long messages on one line", () => {
    expect(preview("a\n\nb   c")).toBe("a b c");
    expect(preview("x".repeat(200), 10)).toHaveLength(10);
  });
  it("formats prices", () => {
    expect(formatPrice(0)).toBe("$0");
    expect(formatPrice(2900)).toBe("$29");
    expect(formatPrice(1999)).toBe("$19.99");
  });
});

describe("plans and roles", () => {
  it("falls back to Free for unknown plans", () => {
    expect(getPlan("nope").id).toBe("free");
    expect(getPlan("pro").features.summaries).toBe(true);
  });
  it("ranks roles", () => {
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("agent", "admin")).toBe(false);
  });
});

describe("validation", () => {
  it("normalises emails and enforces password length", () => {
    const ok = registerSchema.safeParse({ name: " Sam ", email: " Sam@Example.COM ", password: "correct horse", organizationName: "Acme" });
    expect(ok.success && ok.data.email).toBe("sam@example.com");
    expect(registerSchema.safeParse({ name: "Sam", email: "sam@example.com", password: "short", organizationName: "Acme" }).success).toBe(false);
  });
  it("accepts bare origins only", () => {
    expect(originSchema.safeParse("https://shop.example.com").success).toBe(true);
    expect(originSchema.safeParse("https://shop.example.com/").success).toBe(true);
    expect(originSchema.safeParse("https://shop.example.com/path").success).toBe(false);
    expect(originSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(originSchema.safeParse("ftp://example.com").success).toBe(false);
  });
  it("rejects a filled honeypot", () => {
    expect(widgetMessageSchema.safeParse({ body: "hi", website: "spam" }).success).toBe(false);
    expect(widgetMessageSchema.safeParse({ body: "hi", website: "" }).success).toBe(true);
  });
});
