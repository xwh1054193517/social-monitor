import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy
} from "@nestjs/common";
import { EncryptionService } from "../crypto/encryption.service";
import { TelegramAccountRepository } from "./telegram-account.repository";
import { TelegramClientManager } from "./telegram-client-manager.service";

/**
 * Restores persisted Telegram sessions on startup by asking the Python
 * sidecar (`apps/telegram-worker`) to connect them.
 *
 * Actual message listening lives inside the sidecar; captured messages are
 * pushed back to NestJS via the internal ingest endpoint (see
 * `TelegramIngestController`). This class intentionally keeps the
 * `startFor`/`restoreAccounts` surface the old GramJS listener exposed.
 */
@Injectable()
export class TelegramListener
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramListener.name);
  private readonly listening = new Set<string>();

  constructor(
    private readonly clients: TelegramClientManager,
    private readonly accounts: TelegramAccountRepository,
    private readonly encryption: EncryptionService
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
        // Common on first run after the GramJS -> Telethon migration: the
        // stored GramJS session cannot be parsed by Telethon and the account
        // must be re-logged-in from the web UI.
        this.logger.warn(
          `Failed to restore Telegram account ${account.phone}: ${String(error)}`
        );
      }
    }
  }

  /**
   * Kept for API compatibility: listening is owned by the Python sidecar,
   * which starts forwarding as soon as a client is connected.
   */
  startFor(phone: string): void {
    if (this.listening.has(phone)) {
      return;
    }
    this.listening.add(phone);
    this.logger.log(`collector.started phone=${phone}`);
    this.logger.log(`Listening for new messages on account ${phone}`);
  }

  onModuleDestroy(): void {
    for (const phone of this.listening) {
      this.logger.log(`collector.stopped phone=${phone}`);
    }
  }
}
