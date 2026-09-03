import { NotificationPayload } from "./notification-provider.interface";

/**
 * 统一的通知转发文案，Telegram / QQ 等文本渠道共用，格式每项一行：
 *
 *   【监控渠道】
 *   【监控对象】
 *   【发言人】   ← 仅 TG 群组消息存在
 *   正文
 *   原文：链接   ← 可选
 *
 * 超过 maxLength 时截断并在末尾追加 "..."
 */
export function buildForwardText(
  payload: NotificationPayload,
  maxLength: number
): string {
  const lines: string[] = [`【${payload.sourceLabel}】`, `【${payload.targetName}】`];
  if (payload.author) {
    lines.push(`【${payload.author}】`);
  }
  lines.push(payload.content);
  if (payload.url) {
    lines.push(`原文：${payload.url}`);
  }

  const text = lines.join("\n");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}
