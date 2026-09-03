import { BadRequestException, Injectable } from "@nestjs/common";
import { NotificationChannelType } from "@prisma/client";
import { NotificationProvider } from "./notification-provider.interface";
import { QQNotificationProvider } from "./providers/qq.provider";
import { TelegramNotificationProvider } from "./providers/telegram.provider";
import { WeChatNotificationProvider } from "./providers/wechat.provider";

@Injectable()
export class NotificationProviderFactory {
  private readonly providers = new Map<
    NotificationChannelType,
    NotificationProvider
  >();

  constructor(
    telegram: TelegramNotificationProvider,
    wechat: WeChatNotificationProvider,
    qq: QQNotificationProvider
  ) {
    this.register(telegram);
    this.register(wechat);
    this.register(qq);
  }

  register(provider: NotificationProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: NotificationChannelType): NotificationProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Unsupported notification channel type: ${type}`,
        code: "UNSUPPORTED_CHANNEL_TYPE"
      });
    }
    return provider;
  }
}
