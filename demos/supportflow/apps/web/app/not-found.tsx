import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <Link href="/" aria-label="SupportFlow home" className="inline-block">
          <Logo />
        </Link>
        <p className="mt-10 font-mono text-sm text-subtle">404</p>
        <h1 className="mt-2 font-display text-[2.5rem] leading-tight">This page doesn&apos;t exist</h1>
        <p className="mt-3 text-muted">The link may be old, or the page may have moved.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className={buttonVariants()}>Go to the homepage</Link>
          <Link href="/app" className={buttonVariants({ variant: "secondary" })}>Open dashboard</Link>
        </div>
      </div>
    </main>
  );
}
