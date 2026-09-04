import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { apiData } from "@social-monitor/shared";
import { EncryptionService } from "../crypto/encryption.service";
import { TelegramAccountRepository } from "./telegram-account.repository";
import {
  TelegramClientManager,
  TelegramDialogDto
} from "./telegram-client-manager.service";
import { TelegramListener } from "./telegram-listener";

export type { TelegramDialogDto };

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly clients: TelegramClientManager,
    private readonly accounts: TelegramAccountRepository,
    private readonly encryption: EncryptionService,
    private readonly listener: TelegramListener
  ) {}

  async getStatus() {
    const status = await this.clients.getStatus();
    return apiData({
      connected: status.connected,
      phone: status.connected ? status.phone : null
    });
  }

  async getDialogs() {
    await this.requireConnected();
    return apiData(await this.clients.fetchDialogs());
  }

  async getChannels() {
    await this.requireConnected();
    return apiData(await this.clients.fetchChannels());
  }

  async getGroups() {
    await this.requireConnected();
    return apiData(await this.clients.fetchGroups());
  }

  async reconnect() {
    const accounts = await this.accounts.findConnected();
    const account = accounts[0];
    if (!account) {
      throw new ConflictException({
        statusCode: 409,
        message: "No connected Telegram account to reconnect",
        code: "TELEGRAM_NO_ACCOUNT"
      });
    }
    // Reconnect the most recently persisted account via the Python sidecar.
    try {
      const session = this.encryption.decrypt(account.session);
      await this.clients.connectWithSession(account.phone, session);
      this.listener.startFor(account.phone);
    } catch (error) {
      this.logger.error(`Reconnect failed: ${String(error)}`);
      throw new ConflictException({
        statusCode: 409,
        message: error instanceof Error ? error.message : String(error),
        code: "TELEGRAM_RECONNECT_FAILED"
      });
    }
    return apiData({ connected: true, phone: account.phone });
  }

  async logout() {
    const accounts = await this.accounts.findConnected();
    const account = accounts[0];
    if (!account) {
      return apiData({ disconnected: false, message: "No connected account" });
    }
    const phone = account.phone;

    // Disconnect the sidecar client.
    try {
      await this.clients.disconnect(phone);
    } catch (error) {
      this.logger.warn(`Client disconnect failed: ${String(error)}`);
    }

    // Mark as disconnected in DB and delete the session.
    await this.accounts.update(account.id, {
      connected: false,
      session: ""
    });

    this.logger.log(`telegram.disconnected phone=${phone}`);
    return apiData({ disconnected: true, phone });
  }

  private async requireConnected(): Promise<void> {
    const status = await this.clients.getStatus();
    if (!status.connected) {
      throw new ConflictException({
        statusCode: 409,
        message:
          "No active Telegram session. Login first via /api/telegram/login.",
        code: "TELEGRAM_NOT_CONNECTED"
      });
    }
  }
}
