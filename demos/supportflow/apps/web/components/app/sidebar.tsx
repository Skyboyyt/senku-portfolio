"use client";

import {
  BarChart3,
  BookOpen,
  Check,
  ChevronsUpDown,
  CreditCard,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageSquareCode,
  Plus,
  Settings,
  Ticket,
  UserCog,
  Users,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { LABELS } from "@supportflow/shared";
import { LogoMark } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRealtime } from "./realtime";
import { useSession } from "./session";

interface Counts {
  open: number;
  unread: number;
  needsHuman: number;
}

const MAIN = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/app/inbox", label: "Inbox", icon: Inbox, badge: "inbox" as const },
  { href: "/app/tickets", label: "Tickets", icon: Ticket },
  { href: "/app/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/app/customers", label: "Customers", icon: Users },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
];
const WORKSPACE = [
  { href: "/app/widget", label: "Chat widget", icon: MessageSquareCode },
  { href: "/app/team", label: "Team", icon: UsersRound },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { session } = useSession();
  const { data: counts } = useSWR<Counts>("/conversations/counts", { refreshInterval: 60_000 });
  const { status } = useRealtime();

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const link = (item: (typeof MAIN)[number] | (typeof WORKSPACE)[number]) => {
    const Icon = item.icon;
    const active = isActive(item.href, "exact" in item ? item.exact : false);
    const badge = "badge" in item && counts ? counts.unread || counts.needsHuman : 0;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors md:min-h-8",
            active ? "bg-surface-3 font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text",
          )}
        >
          <Icon className={cn("size-4 shrink-0", active ? "text-text" : "text-subtle group-hover:text-muted")} aria-hidden />
          <span className="flex-1 truncate">{item.label}</span>
          {badge > 0 && (
            <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-5 text-primary-fg">
              {badge > 99 ? "99+" : badge}
              <span className="sr-only"> conversations need attention</span>
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <WorkspaceSwitcher />
      </div>
      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 pb-3">
        <ul className="space-y-0.5">{MAIN.map(link)}</ul>
        <p className="mb-1 mt-6 px-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Workspace</p>
        <ul className="space-y-0.5">{WORKSPACE.map(link)}</ul>
      </nav>
      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center gap-2 px-2.5 text-xs text-subtle">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", status === "live" ? "bg-success" : status === "connecting" ? "bg-warning" : "bg-danger")}
          />
          <span role="status">{status === "live" ? "Live updates on" : status === "connecting" ? "Connecting…" : "Offline — reconnecting"}</span>
          <span className="ml-auto">AI: {session.ai.provider === "extractive" ? "excerpts" : session.ai.available ? "on" : "off"}</span>
        </div>
        <UserMenu />
      </div>
    </div>
  );
}

function WorkspaceSwitcher() {
  const { session, mutate } = useSession();
  const { mutate: mutateAll } = useSWRConfig();
  const router = useRouter();
  const toast = useToast();
  const org = session.organization;

  const switchTo = async (id: string) => {
    try {
      await mutate(api("/auth/switch-org", { body: { organizationId: id } }), { revalidate: false });
      // Drop every cached query from the previous workspace.
      await mutateAll((key) => key !== "/auth/session", undefined, { revalidate: true });
      router.push("/app");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <Dropdown>
      <DropdownTrigger className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-surface-2">
        <LogoMark className="size-7" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-text">{org?.name ?? "No workspace"}</span>
          <span className="block text-xs text-subtle">{session.role ? LABELS.role[session.role] : ""}</span>
        </span>
        <ChevronsUpDown className="size-4 text-subtle" aria-hidden />
        <span className="sr-only">Switch workspace</span>
      </DropdownTrigger>
      <DropdownContent align="start" className="w-64">
        <DropdownLabel>Workspaces</DropdownLabel>
        {session.organizations.map((o) => (
          <DropdownItem key={o.id} onSelect={() => o.id !== org?.id && void switchTo(o.id)}>
            <span className="flex-1 truncate">{o.name}</span>
            {o.id === org?.id && <Check aria-label="Current" />}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href="/app/new-workspace">
            <Plus /> New workspace
          </Link>
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function UserMenu() {
  const { session } = useSession();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const signOut = async () => {
    try {
      await api("/auth/logout", { body: {} });
    } finally {
      await mutate(() => true, undefined, { revalidate: false });
      router.replace("/login");
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Dropdown>
        <DropdownTrigger className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-surface-2">
          <Avatar name={session.user.name} className="size-7" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-text">{session.user.name}</span>
            <span className="block truncate text-xs text-subtle">{session.user.email}</span>
          </span>
        </DropdownTrigger>
        <DropdownContent align="start" side="top" className="w-56">
          <DropdownItem asChild>
            <Link href="/app/settings#account">
              <UserCog /> Your account
            </Link>
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <Tooltip content="Colour theme">
        <span>
          <ThemeToggle />
        </span>
      </Tooltip>
    </div>
  );
}
