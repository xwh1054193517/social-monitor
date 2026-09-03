import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import { NotificationChannelType } from "@prisma/client";
import { buildForwardText } from "../message-format";
import {
  NotificationPayload,
  NotificationProvider
} from "../notification-provider.interface";

const MAX_MESSAGE_LENGTH = 4096;

/** Hard cap on the Bot API HTTP round-trip so requests never hang. */
const SEND_TIMEOUT_MS = 10_000;

interface TelegramChannelConfig {
  botToken: string;
  chatId: string;
}

/**
 * Sends notifications through the real Telegram Bot API (`sendMessage`).
 *
 * The channel config (persisted as JSON) carries the bot token and target
 * chat id. Only text is sent — media is never touched, in line with the
 * project-wide "no media download" constraint.
 */
@Injectable()
export class TelegramNotificationProvider implements NotificationProvider {
  readonly type = NotificationChannelType.TELEGRAM;
  private readonly logger = new Logger(TelegramNotificationProvider.name);

  async send(config: unknown, payload: NotificationPayload): Promise<void> {
    const { botToken, chatId } = this.parseConfig(config);
    const text = TelegramNotificationProvider.buildText(payload);

    let response: Response;
    try {
      response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
        }
      );
    } catch (error) {
      this.logger.error(
        `Telegram Bot API request failed: ${String(error)}`
      );
      throw new ServiceUnavailableException({
        statusCode: 502,
        message:
          "无法连接 Telegram Bot API（api.telegram.org）：本机网络无法直连 Telegram，请通过代理运行或部署到可访问 Telegram 的服务器",
        code: "TELEGRAM_NETWORK_UNREACHABLE"
      });
    }

    if (!response.ok) {
      const body = await response.text();
      throw new ServiceUnavailableException({
        statusCode: 502,
        message: `Telegram Bot API error (${response.status}): ${body}`,
        code: "TELEGRAM_SEND_FAILED"
      });
    }

    this.logger.log(`Telegram notification sent to chat ${chatId}`);
  }

  /**
   * Renders the notification in the shared forwarding format (one element per
   * line). Truncates to Telegram's 4096-char message limit.
   */
  static buildText(payload: NotificationPayload): string {
    return buildForwardText(payload, MAX_MESSAGE_LENGTH);
  }

  private parseConfig(config: unknown): TelegramChannelConfig {
    const cfg = (config ?? {}) as Partial<TelegramChannelConfig>;
    if (!cfg.botToken || !cfg.chatId) {
      throw new BadRequestException({
        statusCode: 400,
        message: "TELEGRAM channel requires config.botToken and config.chatId",
        code: "INVALID_CHANNEL"
      });
    }
    return { botToken: cfg.botToken, chatId: cfg.chatId };
  }
}
