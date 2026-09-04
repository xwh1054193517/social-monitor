import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * HTTP proxy to the Python Telegram sidecar (`apps/telegram-worker`).
 *
 * The sidecar owns the MTProto user clients (Telethon): the login flow,
 * connection lifecycle and the NewMessage listeners. This manager keeps the
 * same public surface the GramJS wrapper used to have, so callers
 * (TelegramAuthService / TelegramService / health) only switch from direct
 * GramJS calls to proxied ones. Messages captured by the sidecar are pushed
 * back to NestJS via the internal ingest endpoint, not through this class.
 */
export interface TelegramDialogDto {
  id: string;
  title: string;
  username: string | null;
  type: "user" | "group" | "channel" | "megagroup";
}

export interface TelegramStatus {
  phone: string | null;
  connected: boolean;
}

interface SidecarPayload {
  message?: string;
  code?: string;
}

@Injectable()
export class TelegramClientManager {
  private readonly logger = new Logger(TelegramClientManager.name);

  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>("TELEGRAM_SIDECAR_URL", "http://localhost:9400") ?? ""
    ).replace(/\/+$/, "");
    this.secret = config.get<string>("INTERNAL_API_SECRET", "") ?? "";
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 35_000
  ): Promise<T> {
    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(this.secret ? { "X-Internal-Secret": this.secret } : {})
        },
        signal: AbortSignal.timeout(timeoutMs)
      };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`sidecar.unreachable ${method} ${path}: ${reason}`);
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: `Telegram worker (${this.baseUrl}) unreachable: ${reason}`,
        code: "TELEGRAM_WORKER_UNREACHABLE"
      });
    }

    const payload = (await response
      .json()
      .catch(() => ({}))) as SidecarPayload & T;
    if (!response.ok) {
      const message =
        payload.message ??
        `Sidecar request failed with status ${response.status}`;
      const code = payload.code ?? "TELEGRAM_SIDECAR_ERROR";
      this.logger.warn(
        `sidecar.error ${method} ${path} status=${response.status} code=${code}`
      );
      if (response.status >= 500) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          message,
          code
        });
      }
      throw new BadRequestException({ statusCode: 400, message, code });
    }
    return payload;
  }

  /** Connection status of the most recently used account in the sidecar. */
  async getStatus(): Promise<TelegramStatus> {
    const data = await this.request<{
      currentPhone: string | null;
      connected: boolean;
    }>("GET", "/status");
    return {
      phone: data.currentPhone ?? null,
      connected: data.connected === true
    };
  }

  /** Liveness probe used by the health endpoint. Never throws. */
  async isHealthy(): Promise<boolean> {
    try {
      const data = await this.request<{ status: string }>(
        "GET",
        "/health",
        undefined,
        5_000
      );
      return data.status === "ok";
    } catch {
      return false;
    }
  }

  async fetchDialogs(): Promise<TelegramDialogDto[]> {
    const data = await this.request<{ data: TelegramDialogDto[] }>(
      "GET",
      "/dialogs"
    );
    return data.data ?? [];
  }

  async fetchChannels(): Promise<TelegramDialogDto[]> {
    const data = await this.request<{ data: TelegramDialogDto[] }>(
      "GET",
      "/channels"
    );
    return data.data ?? [];
  }

  async fetchGroups(): Promise<TelegramDialogDto[]> {
    const data = await this.request<{ data: TelegramDialogDto[] }>(
      "GET",
      "/groups"
    );
    return data.data ?? [];
  }

  /**
   * Asks the sidecar to connect a persisted (Telethon StringSession) session
   * and start listening. Used at boot / reconnect.
   */
  async connectWithSession(phone: string, session: string): Promise<void> {
    await this.request("POST", "/connect", { phone, session });
    this.logger.log(`telegram.connected phone=${phone}`);
  }

  async sendCode(
    phone: string
  ): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }> {
    const data = await this.request<{
      phoneCodeHash: string;
      isCodeViaApp: boolean;
    }>("POST", "/login/start", { phone });
    return {
      phoneCodeHash: data.phoneCodeHash,
      isCodeViaApp: data.isCodeViaApp
    };
  }

  /**
   * Submits the login code received via SMS/app. Returns whether the account
   * has 2FA enabled and the password step is required.
   */
  async submitCode(
    phone: string,
    code: string
  ): Promise<{ passwordRequired: boolean }> {
    const data = await this.request<{ passwordRequired: boolean }>(
      "POST",
      "/login/code",
      { phone, code }
    );
    return { passwordRequired: data.passwordRequired === true };
  }

  async submitPassword(phone: string, password: string): Promise<void> {
    await this.request("POST", "/login/password", { phone, password });
  }

  /** Exports the Telethon StringSession of the logged-in client. */
  async saveSession(phone: string): Promise<string> {
    const data = await this.request<{ session: string }>(
      "POST",
      "/save-session",
      { phone }
    );
    return data.session;
  }

  async disconnect(phone: string): Promise<void> {
    await this.request("POST", "/disconnect", { phone });
    this.logger.log(`telegram.disconnected phone=${phone}`);
  }
}
