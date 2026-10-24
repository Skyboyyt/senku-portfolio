"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Subtle enter transition between dashboard pages (disabled with reduced motion). */
export default function DashboardTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
