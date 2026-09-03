"use client";

import { useCallback, useEffect, useState } from "react";
import { api, buildQuery } from "@/lib/api/client";
import type { ApiPaginated } from "@/lib/api/client";
import type { NotificationTask } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待发送",
  PROCESSING: "处理中",
  SENT: "已发送",
  FAILED: "失败",
  CANCELLED: "已取消"
};

const STATUS_TONE: Record<string, string> = {
  SENT: "text-emerald-700",
  FAILED: "text-red-600",
  PROCESSING: "text-amber-600",
  PENDING: "text-[var(--muted)]",
  CANCELLED: "text-[var(--muted)]"
};

export default function NotificationsPage() {
  const [tasks, setTasks] = useState<NotificationTask[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiPaginated<NotificationTask>>(
        `/notifications/tasks${buildQuery({ page, pageSize, status })}`
      );
      setTasks(res.data);
      setTotal(res.meta.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">通知</h1>
          <p className="text-sm text-[var(--muted)]">通知任务状态与错误</p>
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
        >
          <option value="">全部状态</option>
          <option value="PENDING">待发送</option>
          <option value="PROCESSING">处理中</option>
          <option value="SENT">已发送</option>
          <option value="FAILED">失败</option>
          <option value="CANCELLED">已取消</option>
        </select>
      </header>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : loading ? (
        <p className="text-sm text-[var(--muted)]">加载中…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">暂无通知任务</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--panel)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">渠道</th>
                <th className="px-4 py-3 font-medium">目标</th>
                <th className="px-4 py-3 font-medium">消息</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">尝试</th>
                <th className="px-4 py-3 font-medium">错误</th>
                <th className="px-4 py-3 font-medium">发送时间</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3 font-medium">{t.channel.name}</td>
                  <td className="px-4 py-3">{t.message.targetName}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-[var(--muted)]">
                    {t.message.content}
                  </td>
                  <td className={`px-4 py-3 ${STATUS_TONE[t.status] ?? ""}`}>
                    {STATUS_LABELS[t.status] ?? t.status}
                  </td>
                  <td className="px-4 py-3">{t.attempts}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-[var(--muted)]">
                    {t.lastError ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {t.sentAt ? new Date(t.sentAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
        <span>
          共 {total} 条 · 第 {page} / {totalPages} 页
        </span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 disabled:opacity-40"
          >
            上一页
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>
    </main>
  );
}
