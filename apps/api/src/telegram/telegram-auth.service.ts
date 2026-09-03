import {
  BadRequestException,
  Injectable,
  Logger
} from "@nestjs/common";
import { apiData } from "@social-monitor/shared";
import { EncryptionService } from "../crypto/encryption.service";
import { TelegramAccountRepository } from "./telegram-account.repository";
import { TelegramClientManager } from "./telegram-client-manager.service";
import { TelegramListener } from "./telegram-listener";
import { LoginCodeDto } from "./dto/login-code.dto";
import { LoginPasswordDto } from "./dto/login-password.dto";
import { LoginStartDto } from "./dto/login-start.dto";

@Injectable()
export class TelegramAuthService {
  private readonly logger = new Logger(TelegramAuthService.name);

  constructor(
    private readonly clients: TelegramClientManager,
    private readonly accounts: TelegramAccountRepository,
    private readonly encryption: EncryptionService,
    private readonly listener: TelegramListener
  ) {}

  async startLogin(dto: LoginStartDto) {
    const phone = this.normalizePhone(dto.phone);
    try {
      const result = await this.clients.sendCode(phone);
      return apiData({
        phone,
        phoneCodeHash: result.phoneCodeHash,
        isCodeViaApp: result.isCodeViaApp
      });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async submitCode(dto: LoginCodeDto) {
    const phone = this.normalizePhone(dto.phone);
    try {
      await this.clients.submitCode(phone, dto.code);
    } catch (error) {
      if (TelegramClientManager.isPasswordNeeded(error)) {
        return apiData({ phone, passwordRequired: true });
      }
      throw this.toHttpError(error);
    }
    await this.persistSession(phone);
    return apiData({ phone, connected: true });
  }

  async submitPassword(dto: LoginPasswordDto) {
    const phone = this.normalizePhone(dto.phone);
    try {
      await this.clients.submitPassword(phone, dto.password);
    } catch (error) {
      throw this.toHttpError(error);
    }
    await this.persistSession(phone);
    return apiData({ phone, connected: true });
  }

  private async persistSession(phone: string): Promise<void> {
    const session = this.clients.saveSession(phone);
    const encrypted = this.encryption.encrypt(session);
    await this.accounts.upsert(phone, encrypted, true);
    this.listener.startFor(phone);
    this.logger.log(`Telegram account ${phone} logged in`);
  }

  private normalizePhone(phone: string): string {
    return phone.trim().replace(/[^\d+]/g, "");
  }

  private toHttpError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new BadRequestException({
      statusCode: 400,
      message,
      code: "TELEGRAM_AUTH_FAILED"
    });
  }
}
