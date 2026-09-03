import { Injectable, Logger } from "@nestjs/common";
import { NotificationChannelType } from "@prisma/client";
import {
  NotificationPayload,
  NotificationProvider
} from "../notification-provider.interface";

@Injectable()
export class WeChatNotificationProvider implements NotificationProvider {
  readonly type = NotificationChannelType.WECHAT;
  private readonly logger = new Logger(WeChatNotificationProvider.name);

  // Phase 6: mock implementation. Real enterprise WeChat webhook
  // is wired up in Phase 11.
  async send(_config: unknown, payload: NotificationPayload): Promise<void> {
    this.logger.log(
      `[MOCK] WeChat notification -> "${payload.targetName}": ${payload.content.slice(0, 80)}`
    );
  }
}
