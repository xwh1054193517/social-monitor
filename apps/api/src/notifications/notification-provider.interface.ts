import { NotificationChannelType } from "@prisma/client";

export interface NotificationPayload {
  /** 监控渠道标签：X / TG频道 / TG群组 */
  sourceLabel: string;
  /** 监控对象名称：推特名字 / 频道名 / 群组名 */
  targetName: string;
  /** 发言人（仅 TG 群组有，其他渠道为空字符串） */
  author: string;
  content: string;
  url: string | null;
}

export interface NotificationProvider {
  readonly type: NotificationChannelType;
  send(config: unknown, payload: NotificationPayload): Promise<void>;
}
