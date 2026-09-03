"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  LogOut,
  MessageCircle,
  Power,
  RefreshCw,
  Send,
  Trash2,
  Users
} from "lucide-react";
import { api } from "@/lib/api/client";
import type { ApiEnvelope } from "@/lib/api/client";
import type { NotificationChannel, TelegramStatus } from "@/lib/types";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="text-sm text-[var(--muted)]">配置平台接入与通知渠道</p>
      </header>

      <div className="flex flex-col gap-6">
        <TelegramAccountSection />
        <TelegramBotSection />
        <PlaceholderSection
          icon={<MessageCircle className="h-5 w-5" />}
          title="X API"
          description="X（Twitter）采集尚未启用。"
        />
        <QqBotSection />
      </div>
    </main>
  );
}

function PlaceholderSection({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--background)] text-[var(--muted)]">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-sm text-[var(--muted)]">{description}</p>
        </div>
      </div>
    </section>
  );
}

function TelegramAccountSection() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"start" | "code" | "password">("start");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.get<ApiEnvelope<TelegramStatus>>("/telegram/status");
      setStatus(res.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function start() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/telegram/login/start", { phone });
      setStep("code");
      setMessage("验证码已发送");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.post<ApiEnvelope<{ phone: string; passwordRequired?: boolean }>>(
        "/telegram/login/code",
        { phone, code }
      );
      if (res.data.passwordRequired) {
        setStep("password");
        setMessage("需要两步验证密码");
      } else {
        setStep("start");
        setCode("");
        await loadStatus();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/telegram/login/password", { phone, password });
      setStep("start");
      setPassword("");
      setCode("");
      await loadStatus();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function reconnect() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/telegram/reconnect");
      await loadStatus();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/telegram/logout");
      setPhone("");
      setCode("");
      setPassword("");
      setStep("start");
      await loadStatus();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#e1f3ef] text-[var(--accent-strong)]">
            <Send className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Telegram 账号</h2>
            <p className="text-sm text-[var(--muted)]">
              {status
                ? status.connected
                  ? `已连接 · ${status.phone ?? ""}`
                  : "未连接"
                : "加载中…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status?.connected && (
            <button
              onClick={() => void logout()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              退出
            </button>
          )}
          <button
            onClick={() => void reconnect()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            重连
          </button>
        </div>
      </div>

      {message && <p className="mb-3 text-sm">{message}</p>}

      {step === "start" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">手机号</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+8613800000000"
              className="rounded-md border border-[var(--line)] px-3 py-2"
            />
          </label>
          <button
            onClick={() => void start()}
            disabled={busy || !phone}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            发送验证码
          </button>
        </div>
      )}

      {step === "code" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">验证码</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12345"
              className="rounded-md border border-[var(--line)] px-3 py-2"
            />
          </label>
          <button
            onClick={() => void submitCode()}
            disabled={busy || !code}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            提交
          </button>
        </div>
      )}

      {step === "password" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">两步验证密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-[var(--line)] px-3 py-2"
            />
          </label>
          <button
            onClick={() => void submitPassword()}
            disabled={busy || !password}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            提交
          </button>
        </div>
      )}
    </section>
  );
}

function TelegramBotSection() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ApiEnvelope<NotificationChannel[]>>(
        "/notifications/channels?type=TELEGRAM"
      );
      setChannels(res.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/notifications/channels", {
        name,
        type: "TELEGRAM",
        config: { botToken, chatId }
      });
      setName("");
      setBotToken("");
      setChatId("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function test(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      await api.post(`/notifications/channels/${id}/test`);
      setMessage("测试消息已发送");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("确定删除此通知渠道？")) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.delete(`/notifications/channels/${id}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await api.patch(`/notifications/channels/${id}`, { enabled });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#e1f3ef] text-[var(--accent-strong)]">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Telegram Bot 通知</h2>
          <p className="text-sm text-[var(--muted)]">
            通过 Bot API 推送通知（bot token + chat id）
          </p>
        </div>
      </div>

      {message && <p className="mb-3 text-sm">{message}</p>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">渠道名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Telegram Bot"
            className="rounded-md border border-[var(--line)] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">Bot Token</span>
          <input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456:ABC..."
            className="rounded-md border border-[var(--line)] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-[var(--muted)]">Chat ID</span>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="7037228781"
            className="rounded-md border border-[var(--line)] px-3 py-2"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            onClick={() => void create()}
            disabled={busy || !name || !botToken || !chatId}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            新增渠道
          </button>
        </div>
      </div>

      {channels.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                <th className="px-4 py-2 font-medium">名称</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => void toggleEnabled(c.id, !c.enabled)}
                      disabled={busy}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      <Power className="h-3 w-3" aria-hidden="true" />
                      {c.enabled ? "启用" : "停用"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => void test(c.id)}
                        disabled={busy}
                        className="rounded-md border border-[var(--line)] px-3 py-1 text-sm disabled:opacity-60"
                      >
                        测试
                      </button>
                      <button
                        onClick={() => void remove(c.id)}
                        disabled={busy}
                        className="rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function QqBotSection() {
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [name, setName] = useState("");
  const [groupOpenid, setGroupOpenid] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ApiEnvelope<NotificationChannel[]>>(
        "/notifications/channels?type=QQ"
      );
      setChannels(res.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/notifications/channels", {
        name,
        type: "QQ",
        config: { groupOpenid }
      });
      setName("");
      setGroupOpenid("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function test(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      await api.post(`/notifications/channels/${id}/test`);
      setMessage("测试消息已发送");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("确定删除此通知渠道？")) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.delete(`/notifications/channels/${id}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await api.patch(`/notifications/channels/${id}`, { enabled });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#e6f1fb] text-[var(--accent-strong)]">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">QQ 群机器人</h2>
          <p className="text-sm text-[var(--muted)]">
            官方机器人推送通知（AppID + 群 openid）
          </p>
        </div>
      </div>

      <p className="mb-3 rounded-md bg-[var(--background)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
        群 openid 不是群号：先把机器人拉进 QQ 群，后端日志会打印该群的 openid
        （机器人入群事件），复制到下方即可。机器人需要在开放平台「已上线」且开启「群聊消息」权限。
      </p>

      {message && <p className="mb-3 text-sm">{message}</p>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">渠道名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="QQ 监控群"
            className="rounded-md border border-[var(--line)] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--muted)]">群 OpenID</span>
          <input
            value={groupOpenid}
            onChange={(e) => setGroupOpenid(e.target.value)}
            placeholder="A1B2C3D4..."
            className="rounded-md border border-[var(--line)] px-3 py-2"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            onClick={() => void create()}
            disabled={busy || !name || !groupOpenid}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            新增渠道
          </button>
        </div>
      </div>

      {channels.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                <th className="px-4 py-2 font-medium">名称</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => void toggleEnabled(c.id, !c.enabled)}
                      disabled={busy}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      <Power className="h-3 w-3" aria-hidden="true" />
                      {c.enabled ? "启用" : "停用"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => void test(c.id)}
                        disabled={busy}
                        className="rounded-md border border-[var(--line)] px-3 py-1 text-sm disabled:opacity-60"
                      >
                        测试
                      </button>
                      <button
                        onClick={() => void remove(c.id)}
                        disabled={busy}
                        className="rounded-md border border-red-200 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
