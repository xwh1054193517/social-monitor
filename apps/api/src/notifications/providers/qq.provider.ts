import { BadRequestException, Injectable } from "@nestjs/common";
import { NotificationChannelType } from "@prisma/client";
import { QqClientService } from "../../qq/qq-client.service";
import { buildForwardText } from "../message-format";
import {
  NotificationPayload,
  NotificationProvider
} from "../notification-provider.interface";

/** QQ 群文本消息的长度上限（保守值，超出则截断）。 */
const MAX_MESSAGE_LENGTH = 2000;

interface QQChannelConfig {
  groupOpenid: string;
}

/**
 * 通过 QQ 官方机器人把通知转发到指定 QQ 群。
 *
 * 渠道 config 只需存 groupOpenid（群 openid，由机器人入群事件捕获，非群号）。
 * 机器人是否在线由 QqGatewayService 的 WebSocket 长连接保证，本 Provider
 * 只负责通过 QqClientService 调用 REST 发消息。
 */
@Injectable()
export class QQNotificationProvider implements NotificationProvider {
  readonly type = NotificationChannelType.QQ;

  constructor(private readonly qq: QqClientService) {}

  async send(config: unknown, payload: NotificationPayload): Promise<void> {
    const { groupOpenid } = this.parseConfig(config);
    const text = buildForwardText(payload, MAX_MESSAGE_LENGTH);
    await this.qq.sendGroupMessage(groupOpenid, text);
  }

  private parseConfig(config: unknown): QQChannelConfig {
    const cfg = (config ?? {}) as Partial<QQChannelConfig>;
    if (!cfg.groupOpenid) {
      throw new BadRequestException({
        statusCode: 400,
        message: "QQ channel requires config.groupOpenid",
        code: "INVALID_CHANNEL"
      });
    }
    return { groupOpenid: cfg.groupOpenid };
  }
}
