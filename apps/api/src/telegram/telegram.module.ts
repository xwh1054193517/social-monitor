import { Module } from "@nestjs/common";
import { CryptoModule } from "../crypto/crypto.module";
import { MessageModule } from "../messages/message.module";
import { TelegramAccountRepository } from "./telegram-account.repository";
import { TelegramAuthService } from "./telegram-auth.service";
import { TelegramClientManager } from "./telegram-client-manager.service";
import { TelegramController } from "./telegram.controller";
import { TelegramListener } from "./telegram-listener";
import { TelegramMapper } from "./telegram-mapper";
import { TelegramService } from "./telegram.service";

@Module({
  imports: [CryptoModule, MessageModule],
  controllers: [TelegramController],
  providers: [
    TelegramAccountRepository,
    TelegramClientManager,
    TelegramMapper,
    TelegramAuthService,
    TelegramService,
    TelegramListener
  ],
  exports: [TelegramClientManager]
})
export class TelegramModule {}
