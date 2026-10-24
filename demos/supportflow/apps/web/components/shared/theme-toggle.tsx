"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, readThemeChoice, type ThemeChoice } from "@/lib/theme";
import { Dropdown, DropdownContent, DropdownRadioGroup, DropdownRadioItem, DropdownTrigger } from "@/components/ui/dropdown";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Light / dark / system. The choice persists; "system" follows the OS live. */
export function ThemeToggle({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setChoice(readThemeChoice());
    setDark(document.documentElement.dataset.theme === "dark");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readThemeChoice() === "system") {
        applyTheme("system");
        setDark(media.matches);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const select = (value: string) => {
    const next = value as ThemeChoice;
    setChoice(next);
    applyTheme(next);
    setDark(document.documentElement.dataset.theme === "dark");
  };

  return (
    <Dropdown>
      <DropdownTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), className)}>
        {dark ? <Moon aria-hidden /> : <Sun aria-hidden />}
        <span className="sr-only">Colour theme</span>
      </DropdownTrigger>
      <DropdownContent className="min-w-40">
        <DropdownRadioGroup value={choice} onValueChange={select}>
          <DropdownRadioItem value="light">
            <Sun className="mr-2 size-4 text-muted" aria-hidden /> Light
          </DropdownRadioItem>
          <DropdownRadioItem value="dark">
            <Moon className="mr-2 size-4 text-muted" aria-hidden /> Dark
          </DropdownRadioItem>
          <DropdownRadioItem value="system">
            <Monitor className="mr-2 size-4 text-muted" aria-hidden /> System
          </DropdownRadioItem>
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}
