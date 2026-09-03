"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  MessageSquare,
  Radar,
  XCircle
} from "lucide-react";
import { api } from "@/lib/api/client";
import type { ApiEnvelope } from "@/lib/api/client";
import type { DashboardOverview } from "@/lib/types";
import { LatestMessages } from "./latest-messages";

const cardConfig = [
  {
    key: "todayMessages",
    label: "今日消息",
    icon: Activity,
    tone: "accent"
  },
  { key: "xMessages", label: "X 消息", icon: MessageSquare, tone: "accent" },
  {
    key: "telegramMessages",
    label: "Telegram 消息",
    icon: MessageSquare,
    tone: "accent"
  },
  { key: "monitors", label: "监控对象", icon: Radar, tone: "accent" },
  {
    key: "notificationSent",
    label: "通知成功",
    icon: CheckCircle2,
    tone: "good"
  },
  {
    key: "notificationFailed",
    label: "通知失败",
    icon: XCircle,
    tone: "bad"
  }
] as const;

export default function DashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ApiEnvelope<DashboardOverview>>("/dashboard/overview")
      .then((res) => {
        if (!cancelled) {
          setData(res.data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        <Bell className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-semibold">仪表盘</h1>
          <p className="text-sm text-[var(--muted)]">今日监控概览</p>
        </div>
      </header>

      {error ? (
        <p className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-red-700">
          加载失败：{error}
        </p>
      ) : !data ? (
        <p className="text-sm text-[var(--muted)]">加载中…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cardConfig.map((card) => {
            const Icon = card.icon;
            return (
              <article
                key={card.key}
                className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm"
              >
                <div
                  className={
                    card.tone === "good"
                      ? "mb-6 flex h-10 w-10 items-center justify-center rounded-md bg-[#e1f3ef] text-emerald-700"
                      : card.tone === "bad"
                        ? "mb-6 flex h-10 w-10 items-center justify-center rounded-md bg-red-50 text-red-600"
                        : "mb-6 flex h-10 w-10 items-center justify-center rounded-md bg-[#e1f3ef] text-[var(--accent-strong)]"
                  }
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="text-sm font-medium text-[var(--muted)]">
                  {card.label}
                </h2>
                <p className="mt-1 text-3xl font-semibold">
                  {data[card.key]}
                </p>
              </article>
            );
          })}
        </div>
      )}

      <LatestMessages />
    </main>
  );
}
