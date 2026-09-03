import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Api, errors, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

/**
 * In-memory registry of GramJS clients. One TelegramAccount = one client.
 *
 * This service owns client creation, connection and the multi-step login flow
 * (sendCode / submitCode / submitPassword). It does NOT persist anything — the
 * caller (TelegramAuthService) is responsible for encrypting and storing the
 * resulting StringSession.
 */
@Injectable()
export class TelegramClientManager implements OnModuleDestroy {
  private readonly logger = new Logger(TelegramClientManager.name);

  private readonly apiId: number;
  private readonly apiHash: string;

  private readonly clients = new Map<string, TelegramClient>();
  private readonly phoneCodeHashes = new Map<string, string>();

  // The most recently connected account. Endpoints without an explicit phone
  // (status / dialogs / channels / groups / reconnect) operate on this one.
  private currentPhone: string | null = null;

  constructor(config: ConfigService) {
    this.apiId = Number(config.get<string>("TELEGRAM_API_ID", "0"));
    this.apiHash = config.get<string>("TELEGRAM_API_HASH", "");
  }

  /**
   * Races a promise against a deadline so Telegram network calls can never
   * hang the HTTP request indefinitely (e.g. when the host cannot reach
   * Telegram DCs at all).
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Timed out after ${ms}ms`)),
          ms
        );
        // Node: don't keep the event loop alive just for this guard.
        timer.unref?.();
      })
    ]);
  }

  /**
   * Connects a client with a hard timeout. On failure the half-dead client
   * is discarded so subsequent attempts start clean, and a clear 503 with a
   * network hint is thrown instead of hanging the caller.
   */
  private async connectClient(
    client: TelegramClient,
    phone: string
  ): Promise<void> {
    try {
      await this.withTimeout(client.connect(), 20_000);
    } catch (error) {
      try {
        await client.disconnect();
      } catch {
        /* best-effort cleanup */
      }
      this.clients.delete(phone);
      this.phoneCodeHashes.delete(phone);
      this.logger.error(
        `telegram.connect_failed phone=${phone}: ${String(error)}`
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        message:
          "连接 Telegram 服务器超时：当前网络无法直连 Telegram，请通过代理运行或将 API 部署到可访问 Telegram 的服务器",
        code: "TELEGRAM_CONNECT_TIMEOUT"
      });
    }
    this.logger.log(`telegram.connected phone=${phone}`);
  }

  get credentials(): { apiId: number; apiHash: string } {
    return { apiId: this.apiId, apiHash: this.apiHash };
  }

  private ensureCredentials(): void {
    if (!this.apiId || !this.apiHash) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: "TELEGRAM_API_ID and TELEGRAM_API_HASH are not configured",
        code: "TELEGRAM_NOT_CONFIGURED"
      });
    }
  }

  has(phone: string): boolean {
    return this.clients.has(phone);
  }

  getClient(phone: string): TelegramClient | undefined {
    return this.clients.get(phone);
  }

  getCurrentPhone(): string | null {
    return this.currentPhone;
  }

  isConnected(phone: string): boolean {
    return this.clients.get(phone)?.connected === true;
  }

  /**
   * Returns an existing client or creates a fresh (unauthenticated) one and
   * connects it to Telegram servers. Used at the start of the login flow.
   */
  async ensureClient(phone: string): Promise<TelegramClient> {
    this.ensureCredentials();
    let client = this.clients.get(phone);
    if (client) {
      if (!client.connected) {
        await client.connect();
      }
      return client;
    }
    client = new TelegramClient(new StringSession(""), this.apiId, this.apiHash, {
      connectionRetries: 2
    });
    this.clients.set(phone, client);
    await this.connectClient(client, phone);
    return client;
  }

  /**
   * Creates a client from a persisted session and connects it. Used when
   * restoring a previously logged-in account (boot / reconnect).
   */
  async connectWithSession(
    phone: string,
    session: string
  ): Promise<TelegramClient> {
    this.ensureCredentials();
    const existing = this.clients.get(phone);
    if (existing?.connected) {
      return existing;
    }
    const client = new TelegramClient(
      new StringSession(session),
      this.apiId,
      this.apiHash,
      { connectionRetries: 2 }
    );
    this.clients.set(phone, client);
    await this.connectClient(client, phone);
    this.currentPhone = phone;
    return client;
  }

  async sendCode(phone: string): Promise<{
    phoneCodeHash: string;
    isCodeViaApp: boolean;
  }> {
    const client = await this.ensureClient(phone);
    const result = await this.withTimeout(
      client.sendCode(this.credentials, phone),
      30_000
    );
    this.phoneCodeHashes.set(phone, result.phoneCodeHash);
    return result;
  }

  /**
   * Submits the login code received via SMS/app. On success the client is
   * authorized. If the account has 2FA enabled, `SESSION_PASSWORD_NEEDED` is
   * thrown and the caller must ask for the password.
   */
  async submitCode(phone: string, code: string): Promise<void> {
    const client = await this.ensureClient(phone);
    const phoneCodeHash = this.phoneCodeHashes.get(phone);
    if (!phoneCodeHash) {
      throw new ServiceUnavailableException({
        statusCode: 400,
        message: "No pending login code for this phone. Call /login/start first.",
        code: "TELEGRAM_NO_PENDING_CODE"
      });
    }
    await client.invoke(
      new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code })
    );
    this.phoneCodeHashes.delete(phone);
    this.currentPhone = phone;
  }

  async submitPassword(phone: string, password: string): Promise<void> {
    const client = await this.ensureClient(phone);
    await client.signInWithPassword(this.credentials, {
      password: async () => password,
      onError: () => {
        /* unreachable for a single password attempt */
      }
    });
    this.currentPhone = phone;
  }

  saveSession(phone: string): string {
    const client = this.clients.get(phone);
    if (!client) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: "No client for this phone",
        code: "TELEGRAM_CLIENT_NOT_FOUND"
      });
    }
    return String(client.session.save());
  }

  /**
   * The active client for status/dialog queries, or null if no account is
   * connected yet.
   */
  getActiveClient(): TelegramClient | null {
    if (!this.currentPhone) {
      return null;
    }
    const client = this.clients.get(this.currentPhone);
    return client?.connected ? client : null;
  }

  async disconnect(phone: string): Promise<void> {
    const client = this.clients.get(phone);
    if (client?.connected) {
      await client.disconnect();
      this.logger.log(`telegram.disconnected phone=${phone}`);
    }
    this.clients.delete(phone);
    this.phoneCodeHashes.delete(phone);
    if (this.currentPhone === phone) {
      this.currentPhone = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    const phones = [...this.clients.keys()];
    await Promise.all(
      phones.map(async (phone) => {
        try {
          await this.disconnect(phone);
        } catch (error) {
          this.logger.warn(`Failed to disconnect ${phone}: ${String(error)}`);
        }
      })
    );
  }

  /** Type guard used by the auth service to detect the 2FA step. */
  static isPasswordNeeded(error: unknown): boolean {
    return (
      error instanceof errors.RPCError &&
      error.errorMessage === "SESSION_PASSWORD_NEEDED"
    );
  }
}
