import Link from "next/link";
import { Logo } from "@/components/shared/logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/register", label: "Create a workspace" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-muted">
            AI-assisted customer support that answers from your own help centre and hands over to people when it matters.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-sm font-medium text-text">{column.title}</h2>
            <ul className="mt-3 space-y-1">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-9 items-center text-sm text-muted hover:text-text">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-[13px] text-subtle sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} SupportFlow</p>
          <p>
            Designed and built by{" "}
            <a href="https://senku-portfolio.vercel.app/" className="underline-offset-4 hover:text-text hover:underline">
              Fahad Sani
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
