"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Radar,
  Settings
} from "lucide-react";
import clsx from "clsx";
import { clearToken } from "@/lib/auth";

const items = [
  { href: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  { href: "/monitors", label: "监控对象", icon: Radar },
  { href: "/messages", label: "消息", icon: MessageSquare },
  { href: "/notifications", label: "通知", icon: Bell },
  { href: "/settings", label: "设置", icon: Settings }
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--panel)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#e1f3ef] text-sm font-bold text-[var(--accent-strong)]">
            S
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Social Monitor
          </span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#e1f3ef] text-[var(--accent-strong)]"
                    : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              clearToken();
              router.replace("/login");
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            退出
          </button>
        </nav>
      </div>
    </header>
  );
}
