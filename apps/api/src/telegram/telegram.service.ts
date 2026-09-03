import {
  ConflictException,
  Injectable,
  Logger
} from "@nestjs/common";
import { Api } from "telegram";
import { apiData } from "@social-monitor/shared";
import { EncryptionService } from "../crypto/encryption.service";
import { TelegramAccountRepository } from "./telegram-account.repository";
import { TelegramClientManager } from "./telegram-client-manager.service";
import { TelegramListener } from "./telegram-listener";

export interface TelegramDialogDto {
  id: string;
  title: string;
  username: string | null;
  type: "user" | "group" | "channel" | "megagroup";
}

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
    const phone = this.clients.getCurrentPhone();
    const connected = phone != null && this.clients.isConnected(phone);
    return apiData({ connected, phone: connected ? phone : null });
  }

  async getDialogs() {
    const client = this.requireActiveClient();
    const dialogs = await client.getDialogs({});
    return apiData(dialogs.map((dialog) => this.toDialogDto(dialog)));
  }

  async getChannels() {
    const client = this.requireActiveClient();
    const dialogs = await client.getDialogs({});
    const channels = dialogs.filter(
      (dialog) =>
        dialog.isChannel &&
        dialog.entity instanceof Api.Channel &&
        !dialog.entity.megagroup
    );
    return apiData(channels.map((dialog) => this.toDialogDto(dialog)));
  }

  async getGroups() {
    const client = this.requireActiveClient();
    const dialogs = await client.getDialogs({});
    const groups = dialogs.filter(
      (dialog) =>
        dialog.isGroup ||
        (dialog.entity instanceof Api.Channel && dialog.entity.megagroup === true)
    );
    return apiData(groups.map((dialog) => this.toDialogDto(dialog)));
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
    // Reconnect the most recently persisted account.
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

    // Disconnect client and remove from registry.
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

  private requireActiveClient() {
    const client = this.clients.getActiveClient();
    if (!client) {
      throw new ConflictException({
        statusCode: 409,
        message: "No active Telegram session. Login first via /api/telegram/login.",
        code: "TELEGRAM_NOT_CONNECTED"
      });
    }
    return client;
  }

  private toDialogDto(dialog: {
    id?: { toString(): string } | null;
    title?: string;
    entity?: unknown;
  }): TelegramDialogDto {
    const entity = dialog.entity;
    let type: TelegramDialogDto["type"] = "user";
    let username: string | null = null;

    if (entity instanceof Api.Channel) {
      type = entity.megagroup ? "megagroup" : "channel";
      username = entity.username ?? null;
    } else if (entity instanceof Api.Chat) {
      type = "group";
    } else if (entity instanceof Api.User) {
      type = "user";
      username = entity.username ?? null;
    }

    return {
      id: dialog.id?.toString() ?? "",
      title: dialog.title ?? "",
      username,
      type
    };
  }
}
