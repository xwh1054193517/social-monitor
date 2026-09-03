import { Module } from "@nestjs/common";
import { QqModule } from "../qq/qq.module";
import { NotificationController } from "./notification.controller";
import { NotificationProviderFactory } from "./notification-provider.factory";
import { NotificationRepository } from "./notification.repository";
import { NotificationService } from "./notification.service";
import { QQNotificationProvider } from "./providers/qq.provider";
import { TelegramNotificationProvider } from "./providers/telegram.provider";
import { WeChatNotificationProvider } from "./providers/wechat.provider";

@Module({
  imports: [QqModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    NotificationProviderFactory,
    TelegramNotificationProvider,
    WeChatNotificationProvider,
    QQNotificationProvider
  ],
  exports: [NotificationService, NotificationProviderFactory]
})
export class NotificationModule {}
