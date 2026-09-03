import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { TelegramClientManager } from "../telegram/telegram-client-manager.service";

export type HealthStatus = "up" | "down" | "not_configured";

export interface HealthOverview {
  status: "ok" | "degraded";
  service: string;
  checks: {
    postgresql: HealthStatus;
    redis: HealthStatus;
    telegram: HealthStatus;
    x: HealthStatus;
    telegram_bot: HealthStatus;
    wechat: HealthStatus;
  };
}

/**
 * Aggregates dependency health for the /health endpoint. PostgreSQL/Redis are
 * probed live; Telegram reflects the in-memory client registry. X and WeChat
 * are out of MVP scope, so they always report `not_configured`.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly clients: TelegramClientManager
  ) {}

  async checkDatabase(): Promise<"up" | "down"> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "up";
    } catch {
      return "down";
    }
  }

  async checkRedis(): Promise<"up" | "down"> {
    const host = this.config.get<string>("REDIS_HOST", "localhost");
    const port = Number(this.config.get<string>("REDIS_PORT", "6379"));
    const password = this.config.get<string>("REDIS_PASSWORD", "");
    const redis = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      connectTimeout: 500,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null
    });
    try {
      await redis.connect();
      await redis.ping();
      return "up";
    } catch {
      return "down";
    } finally {
      try {
        redis.disconnect();
      } catch {
        /* already closed */
      }
    }
  }

  checkTelegram(): HealthStatus {
    const apiId = this.config.get<string>("TELEGRAM_API_ID", "0");
    const apiHash = this.config.get<string>("TELEGRAM_API_HASH", "");
    if (!apiId || apiId === "0" || !apiHash) {
      return "not_configured";
    }
    return this.clients.getActiveClient() ? "up" : "down";
  }

  checkTelegramBot(): HealthStatus {
    return this.config.get<string>("TELEGRAM_BOT_TOKEN")
      ? "up"
      : "not_configured";
  }

  checkX(): HealthStatus {
    return "not_configured";
  }

  checkWeChat(): HealthStatus {
    return "not_configured";
  }

  async overview(): Promise<HealthOverview> {
    const [postgresql, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis()
    ]);

    return {
      status: postgresql === "up" ? "ok" : "degraded",
      service: "social-monitor-api",
      checks: {
        postgresql,
        redis,
        telegram: this.checkTelegram(),
        x: this.checkX(),
        telegram_bot: this.checkTelegramBot(),
        wechat: this.checkWeChat()
      }
    };
  }
}
