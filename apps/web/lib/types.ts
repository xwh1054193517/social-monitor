export type MonitorType = "X_USER" | "TG_CHANNEL" | "TG_GROUP";
export type MessageSource = "X" | "TELEGRAM";

export interface Monitor {
  id: string;
  type: MonitorType;
  name: string;
  username: string | null;
  externalId: string;
  enabled: boolean;
  lastMessageAt: string | null;
}

export interface Message {
  id: string;
  source: MessageSource;
  target: { id: string; name: string };
  author: {
    externalId?: string;
    username?: string;
    displayName?: string;
  } | null;
  content: string;
  url: string | null;
  publishedAt: string;
}

export interface MessageNotification {
  id: string;
  channel: { id: string; name: string; type: string };
  status: string;
  attempts: number;
  sentAt: string | null;
}

export interface NotificationTask {
  id: string;
  messageId: string;
  message: { id: string; targetName: string; content: string };
  channel: { id: string; name: string; type: string };
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: { configured: boolean };
}

export interface DashboardOverview {
  todayMessages: number;
  xMessages: number;
  telegramMessages: number;
  monitors: number;
  notificationSent: number;
  notificationFailed: number;
}

export interface TelegramStatus {
  connected: boolean;
  phone: string | null;
}

export interface TelegramDialog {
  id: string;
  title: string;
  username: string | null;
  type: "user" | "group" | "channel" | "megagroup";
}
