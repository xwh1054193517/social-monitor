"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api/client";
import type { ApiEnvelope } from "@/lib/api/client";
import type { Message, MessageNotification } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待发送",
  PROCESSING: "处理中",
  SENT: "已发送",
  FAILED: "失败",
  CANCELLED: "已取消"
};

export default function MessageDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [message, setMessage] = useState<Message | null>(null);
  const [notifications, setNotifications] = useState<MessageNotification[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    Promise.all([
      api.get<ApiEnvelope<Message>>(`/messages/${id}`),
      api.get<ApiEnvelope<MessageNotification[]>>(`/messages/${id}/notifications`)
    ])
      .then(([msgRes, notifRes]) => {
        if (!cancelled) {
          setMessage(msgRes.data);
          setNotifications(notifRes.data);
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
  }, [id]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-red-700">{error}</p>
      </main>
    );
  }

  if (!message) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-[var(--muted)]">加载中…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href="/messages"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        返回消息列表
      </Link>

      <article className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-6 shadow-sm">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              来源
            </dt>
            <dd className="mt-1 text-sm font-medium">{message.source}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              目标
            </dt>
            <dd className="mt-1 text-sm font-medium">{message.target.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              作者
            </dt>
            <dd className="mt-1 text-sm">
              {message.author?.displayName || message.author?.username || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              发布时间
            </dt>
            <dd className="mt-1 text-sm">
              {new Date(message.publishedAt).toLocaleString()}
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            内容
          </h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
            {message.content}
          </p>
        </div>

        {message.url && (
          <div className="mt-6">
            <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              原文链接
            </h2>
            <a
              href={message.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-[var(--accent)] underline"
            >
              查看原文
            </a>
          </div>
        )}
      </article>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">通知状态</h2>
        {notifications.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">暂无通知记录</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--panel)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                  <th className="px-4 py-3 font-medium">渠道</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">尝试次数</th>
                  <th className="px-4 py-3 font-medium">发送时间</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-3">{n.channel.name}</td>
                    <td className="px-4 py-3">
                      {STATUS_LABELS[n.status] ?? n.status}
                    </td>
                    <td className="px-4 py-3">{n.attempts}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {n.sentAt ? new Date(n.sentAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
