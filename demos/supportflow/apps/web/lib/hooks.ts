"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import type { MemberDto } from "@supportflow/shared";

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useMembers() {
  return useSWR<MemberDto[]>("/team/members");
}
