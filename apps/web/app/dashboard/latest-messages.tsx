"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import { api, API_BASE_URL } from "@/lib/api/client";
import type { ApiEnvelope, ApiPaginated } from "@/lib/api/client";
import type { Message } from "@/lib/types";
import { getToken } from "@/lib/auth";

const MAX_ITEMS = 20;

interface SseEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface CreatedEventData {
  id: string;
  source: string;
  targetName: string;
}

function sourceBadge(message: Message): string {
  return message.source === "X" ? "X" : "TG";
}

function authorLabel(message: Message): string | null {
  const author = message.author;
  if (!author) {
    return null;
  }
  return author.displayName || author.username || author.externalId || null;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

/**
 * Latest monitored messages feed:
 * - loads the 20 most recent messages on mount
 * - subscribes to the API SSE stream and prepends new messages in real time
 * - fixed-height scrollable list, newest entry first with a flash highlight
 */
export function LatestMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<ApiPaginated<Message>>("/messages?page=1&pageSize=20")
      .then((res) => {
        if (!cancelled) {
          setMessages(res.data);
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

  const fetchMessage = useCallback(async (id: string): Promise<Message | null> => {
    try {
      const res = await api.get<ApiEnvelope<Message>>(`/messages/${id}`);
      return res.data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // EventSource cannot set Authorization headers; pass the token via query
    // so the AuthGuard can authenticate the SSE stream.
    const token = getToken();
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";
    const source = new EventSource(`${API_BASE_URL}/events${tokenQuery}`);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (raw) => {
      let event: SseEvent;
      try {
        event = JSON.parse(raw.data) as SseEvent;
      } catch {
        return;
      }
      if (event.type !== "message.created") {
        return;
      }
      const created = event.data as CreatedEventData;
      if (!created?.id) {
        return;
      }

      void fetchMessage(created.id).then((message) => {
        if (!message) {
          return;
        }
        setMessages((prev) => {
          if (prev.some((item) => item.id === message.id)) {
            return prev;
          }
          return [message, ...prev].slice(0, MAX_ITEMS);
        });
      });
    };

    return () => {
      source.close();
    };
  }, [fetchMessage]);

  // Keep the newest entry in view when it arrives.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [messages]);

  return (
    <section className="mt-6 rounded-md border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold">最新消息</h2>
          <span className="text-xs text-[var(--muted)]">
            （实时同步 · 最近 {MAX_ITEMS} 条）
          </span>
        </div>
        <span
          className={
            connected
              ? "inline-flex items-center gap-1 text-xs text-emerald-600"
              : "inline-flex items-center gap-1 text-xs text-[var(--muted)]"
          }
        >
          <span
            className={
              connected
                ? "h-2 w-2 rounded-full bg-emerald-500"
                : "h-2 w-2 rounded-full bg-[var(--muted)]"
            }
            aria-hidden="true"
          />
          {connected ? "实时已连接" : "实时未连接"}
        </span>
      </header>

      {error ? (
        <p className="text-sm text-red-700">加载失败：{error}</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          暂无消息，等待监控数据流入…
        </p>
      ) : (
        <div
          ref={listRef}
          className="scroll-thin max-h-[28rem] space-y-2 overflow-y-auto pr-1"
        >
          {messages.map((message) => (
            <article
              key={message.id}
              className="message-row rounded-md border border-[var(--line)] bg-[var(--panel)] p-3"
            >
              <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <span
                  className={
                    message.source === "X"
                      ? "rounded bg-[#e7eefc] px-1.5 py-0.5 font-medium text-[#3b5bb5]"
                      : "rounded bg-[#e1f3ef] px-1.5 py-0.5 font-medium text-[var(--accent-strong)]"
                  }
                >
                  {sourceBadge(message)}
                </span>
                <span className="font-medium text-[var(--fg)]">
                  {message.target.name}
                </span>
                {authorLabel(message) ? (
                  <span>@{authorLabel(message)}</span>
                ) : null}
                <span className="ml-auto">{formatTime(message.publishedAt)}</span>
              </div>
              <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-all text-sm">
                {message.content}
              </p>
              {message.url ? (
                <a
                  href={message.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-[var(--accent)] hover:underline"
                >
                  查看原文
                </a>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
