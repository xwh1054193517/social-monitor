import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy
} from "@nestjs/common";
import { NewMessage } from "telegram/events";
import type { NewMessageEvent } from "telegram/events";
import { EncryptionService } from "../crypto/encryption.service";
import { MessageRepository } from "../messages/message.repository";
import { MessageService } from "../messages/message.service";
import { TelegramAccountRepository } from "./telegram-account.repository";
import { TelegramClientManager } from "./telegram-client-manager.service";
import { TelegramMapper } from "./telegram-mapper";

/**
 * Attaches a `NewMessage` handler to each connected Telegram client and pipes
 * incoming messages into the platform-agnostic MessageService (which handles
 * dedupe, target resolution and notification routing).
 *
 * Media payloads are never downloaded — only `message.message` is read.
 */
@Injectable()
export class TelegramListener implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramListener.name);
  private readonly listening = new Set<string>();

  constructor(
    private readonly clients: TelegramClientManager,
    private readonly accounts: TelegramAccountRepository,
    private readonly encryption: EncryptionService,
    private readonly mapper: TelegramMapper,
    private readonly messageRepository: MessageRepository,
    private readonly messages: MessageService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      this.logger.log("Telegram listener disabled in test environment");
      return;
    }
    await this.restoreAccounts();
  }

  private async restoreAccounts(): Promise<void> {
    const accounts = await this.accounts.findConnected();
    for (const account of accounts) {
      try {
        const session = this.encryption.decrypt(account.session);
        await this.clients.connectWithSession(account.phone, session);
        this.startFor(account.phone);
      } catch (error) {
        this.logger.warn(
          `Failed to restore Telegram account ${account.phone}: ${String(error)}`
        );
      }
    }
  }

  startFor(phone: string): void {
    if (this.listening.has(phone)) {
      return;
    }
    const client = this.clients.getClient(phone);
    if (!client) {
      return;
    }
    this.listening.add(phone);
    client.addEventHandler(
      (event) => void this.onMessage(event),
      new NewMessage({})
    );
    this.logger.log(`collector.started phone=${phone}`);
    this.logger.log(`Listening for new messages on account ${phone}`);
  }

  private async onMessage(event: NewMessageEvent): Promise<void> {
    const message = event.message;

    // Only text is captured (captions included). Media-only messages without
    // a caption are skipped; media is never downloaded.
    const content = message.message;
    if (!content) {
      return;
    }

    const chatId = message.chatId;
    if (chatId == null) {
      return;
    }
    const externalId = chatId.toString();

    this.logger.log(
      `message.received chatId=${externalId} messageId=${message.id}`
    );

    const target =
      await this.messageRepository.findTelegramTargetByExternalId(externalId);
    if (!target) {
      // Chat is not monitored — ignore.
      return;
    }

    const normalized = this.mapper.toNormalizedMessage(
      target,
      message,
      TelegramMapper.buildExternalId(externalId, message.id)
    );

    try {
      await this.messages.create(normalized);
    } catch (error) {
      this.logger.error(
        `Failed to ingest Telegram message ${normalized.externalId}: ${String(
          error
        )}`
      );
    }
  }

  onModuleDestroy(): void {
    for (const phone of this.listening) {
      this.logger.log(`collector.stopped phone=${phone}`);
    }
  }
}
