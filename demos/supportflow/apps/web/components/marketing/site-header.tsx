"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { useEffect, useState } from "react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the menu after navigating.
  useEffect(() => setOpen(false), [pathname]);

  // Close it if the viewport grows to desktop width while open.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const onChange = () => media.matches && setOpen(false);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="-m-1 rounded-md p-1" aria-label="SupportFlow home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm transition-colors hover:text-text",
                      active ? "text-text" : "text-muted",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "hidden md:inline-flex")}>
            Sign in
          </Link>
          <Link href="/register" className={cn(buttonVariants(), "hidden md:inline-flex")}>
            Start free
          </Link>

          <D.Root open={open} onOpenChange={setOpen}>
            <D.Trigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu aria-hidden />
              </Button>
            </D.Trigger>
            <D.Portal>
              <D.Overlay className="fixed inset-0 z-50 bg-black/30 md:hidden" />
              <D.Content className="fixed inset-x-0 top-0 z-50 flex max-h-dvh flex-col overflow-y-auto border-b border-border bg-bg px-4 pb-6 shadow-lg md:hidden">
                <D.Title className="sr-only">Menu</D.Title>
                <D.Description className="sr-only">Site navigation</D.Description>
                <div className="flex h-16 items-center justify-between">
                  <Logo />
                  <D.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Close menu">
                      <X aria-hidden />
                    </Button>
                  </D.Close>
                </div>
                <nav aria-label="Mobile">
                  <ul className="divide-y divide-border border-y border-border">
                    {NAV.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={pathname === item.href ? "page" : undefined}
                          className="flex min-h-12 items-center text-base font-medium text-text"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
                <div className="mt-6 grid gap-2">
                  <Link href="/register" className={buttonVariants({ size: "lg" })}>
                    Start free
                  </Link>
                  <Link href="/login" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                    Sign in
                  </Link>
                </div>
              </D.Content>
            </D.Portal>
          </D.Root>
        </div>
      </div>
    </header>
  );
}
