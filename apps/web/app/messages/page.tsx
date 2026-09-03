"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { api, buildQuery } from "@/lib/api/client";
import type { ApiPaginated } from "@/lib/api/client";
import type { Message, Monitor } from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  X: "X",
  TELEGRAM: "Telegram"
};

interface Filters {
  keyword: string;
  source: string;
  targetId: string;
  dateFrom: string;
  dateTo: string;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [targets, setTargets] = useState<Monitor[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>({
    keyword: "",
    source: "",
    targetId: "",
    dateFrom: "",
    dateTo: ""
  });
  const [applied, setApplied] = useState<Filters>(filters);

  useEffect(() => {
    api
      .get<ApiPaginated<Monitor>>("/monitors?page=1&pageSize=100")
      .then((res) => setTargets(res.data))
      .catch(() => setTargets([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiPaginated<Message>>(
        `/messages${buildQuery({
          page,
          pageSize,
          keyword: applied.keyword,
          source: applied.source,
          targetId: applied.targetId,
          dateFrom: applied.dateFrom,
          dateTo: applied.dateTo
        })}`
      );
      setMessages(res.data);
      setTotal(res.meta.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  function search() {
    setPage(1);
    setApplied(filters);
  }

  function reset() {
    setFilters({ keyword: "", source: "", targetId: "", dateFrom: "", dateTo: "" });
    setApplied({ keyword: "", source: "", targetId: "", dateFrom: "", dateTo: "" });
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">消息</h1>
        <p className="text-sm text-[var(--muted)]">搜索与浏览采集到的消息</p>
      </header>

      <div className="mb-6 grid gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1 text-sm lg:col-span-2">
          <span className="text-[var(--muted)]">关键词</span>
          <input
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            placeholder="搜索内容 / 作者"
            className="rounded-md border border-[var(--line)] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">来源</span>
          <select
            value={filters.source}
            onChange={(e) => setFilters({ ...filters, source: e.target.value })}
            className="rounded-md border border-[var(--line)] px-3 py-2"
          >
            <option value="">全部</option>
            <option value="X">X</option>
            <option value="TELEGRAM">Telegram</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">目标</span>
          <select
            value={filters.targetId}
            onChange={(e) => setFilters({ ...filters, targetId: e.target.value })}
            className="rounded-md border border-[var(--line)] px-3 py-2"
          >
            <option value="">全部</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">开始日期</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            className="rounded-md border border-[var(--line)] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">结束日期</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            className="rounded-md border border-[var(--line)] px-3 py-2"
          />
        </label>
        <div className="flex items-end gap-2 lg:col-span-6">
          <button
            onClick={search}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            搜索
          </button>
          <button
            onClick={reset}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm"
          >
            重置
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : loading ? (
        <p className="text-sm text-[var(--muted)]">加载中…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">暂无消息</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--panel)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">来源</th>
                <th className="px-4 py-3 font-medium">目标</th>
                <th className="px-4 py-3 font-medium">作者</th>
                <th className="px-4 py-3 font-medium">内容</th>
                <th className="px-4 py-3 font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-[var(--line)] last:border-0"
                >
                  <td className="px-4 py-3">{SOURCE_LABELS[m.source] ?? m.source}</td>
                  <td className="px-4 py-3">{m.target.name}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {m.author?.displayName || m.author?.username || "—"}
                  </td>
                  <td className="max-w-md truncate px-4 py-3">
                    <Link
                      href={`/messages/${m.id}`}
                      className="hover:text-[var(--accent)]"
                    >
                      {m.content}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {new Date(m.publishedAt).toLocaleString()}
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
