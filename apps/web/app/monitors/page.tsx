"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
import { api, buildQuery } from "@/lib/api/client";
import type { ApiEnvelope, ApiPaginated } from "@/lib/api/client";
import type { Monitor, MonitorType, TelegramDialog } from "@/lib/types";

const TYPE_LABELS: Record<MonitorType, string> = {
  X_USER: "X 用户",
  TG_CHANNEL: "Telegram 频道",
  TG_GROUP: "Telegram 群组"
};

interface FormState {
  type: MonitorType;
  name: string;
  username: string;
  externalId: string;
}

const emptyForm: FormState = {
  type: "X_USER",
  name: "",
  username: "",
  externalId: ""
};

export default function MonitorsPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Monitor | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [dialogs, setDialogs] = useState<TelegramDialog[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiPaginated<Monitor>>(
        `/monitors${buildQuery({ page: 1, pageSize: 50 })}`
      );
      setMonitors(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (form.type !== "TG_CHANNEL" && form.type !== "TG_GROUP") {
      setDialogs([]);
      return;
    }
    const path = form.type === "TG_CHANNEL" ? "/telegram/channels" : "/telegram/groups";
    api
      .get<ApiEnvelope<TelegramDialog[]>>(path)
      .then((res) => setDialogs(res.data))
      .catch(() => setDialogs([]));
  }, [form.type]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(monitor: Monitor) {
    setEditing(monitor);
    setForm({
      type: monitor.type,
      name: monitor.name,
      username: monitor.username ?? "",
      externalId: monitor.externalId
    });
    setShowForm(true);
  }

  async function submit() {
    setSaving(true);
    setNotice(null);
    try {
      if (editing) {
        await api.patch(`/monitors/${editing.id}`, {
          name: form.name,
          ...(form.username ? { username: form.username } : {}),
          ...(form.externalId ? { externalId: form.externalId } : {})
        });
        setNotice("已保存");
      } else {
        await api.post("/monitors", {
          type: form.type,
          name: form.name,
          ...(form.username ? { username: form.username } : {}),
          ...(form.externalId ? { externalId: form.externalId } : {})
        });
        setNotice("已创建");
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(monitor: Monitor) {
    await api.post(`/monitors/${monitor.id}/${monitor.enabled ? "disable" : "enable"}`);
    await load();
  }

  async function remove(monitor: Monitor) {
    if (!window.confirm(`确定删除监控对象「${monitor.name}」？`)) {
      return;
    }
    await api.delete(`/monitors/${monitor.id}`);
    await load();
  }

  async function check(monitor: Monitor) {
    const res = await api.post<ApiEnvelope<{ valid: boolean; name: string }>>(
      `/monitors/${monitor.id}/check`
    );
    setNotice(res.data.valid ? `「${res.data.name}」参数有效` : `「${res.data.name}」参数缺失`);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">监控对象</h1>
          <p className="text-sm text-[var(--muted)]">管理 X 与 Telegram 监控目标</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          新增
        </button>
      </header>

      {notice && (
        <p className="mb-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 text-sm">
          {notice}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="mb-6 grid gap-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-5 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">类型</span>
            <select
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as MonitorType })
              }
              className="rounded-md border border-[var(--line)] px-3 py-2"
            >
              <option value="X_USER">X 用户</option>
              <option value="TG_CHANNEL">Telegram 频道</option>
              <option value="TG_GROUP">Telegram 群组</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">名称</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="OpenAI"
              className="rounded-md border border-[var(--line)] px-3 py-2"
            />
          </label>

          {form.type === "X_USER" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">用户名</span>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="OpenAI"
                className="rounded-md border border-[var(--line)] px-3 py-2"
              />
            </label>
          )}

          {form.type !== "X_USER" && dialogs.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">从 Telegram 选择</span>
              <select
                value={form.externalId}
                onChange={(e) => {
                  const dlg = dialogs.find((d) => d.id === e.target.value);
                  setForm({
                    ...form,
                    externalId: e.target.value,
                    name: form.name || dlg?.title || ""
                  });
                }}
                className="rounded-md border border-[var(--line)] px-3 py-2"
              >
                <option value="">手动输入</option>
                {dialogs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}（{d.id}）
                  </option>
                ))}
              </select>
            </label>
          )}

          {form.type !== "X_USER" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Chat ID（externalId）</span>
              <input
                value={form.externalId}
                onChange={(e) => setForm({ ...form, externalId: e.target.value })}
                placeholder="-100123456789"
                className="rounded-md border border-[var(--line)] px-3 py-2"
              />
            </label>
          )}

          <div className="flex items-end gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-strong)] disabled:opacity-60"
            >
              {saving ? "保存中…" : editing ? "保存" : "创建"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-[var(--line)] px-4 py-2 text-sm"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : loading ? (
        <p className="text-sm text-[var(--muted)]">加载中…</p>
      ) : monitors.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">暂无监控对象</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--panel)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">External ID</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">最近消息</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((m) => (
                <tr key={m.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3 font-medium">{m.name}</td>
                  <td className="px-4 py-3">{TYPE_LABELS[m.type]}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{m.externalId}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        m.enabled
                          ? "text-emerald-700"
                          : "text-[var(--muted)]"
                      }
                    >
                      {m.enabled ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {m.lastMessageAt
                      ? new Date(m.lastMessageAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => void check(m)}
                        title="检查"
                        className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--background)]"
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => void toggle(m)}
                        title={m.enabled ? "禁用" : "启用"}
                        className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--background)]"
                      >
                        <Power className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => openEdit(m)}
                        title="编辑"
                        className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--background)]"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => void remove(m)}
                        title="删除"
                        className="rounded-md p-2 text-red-600 hover:bg-red-50"
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
    </main>
  );
}
