import {
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QQ_API_BASE, QQ_TOKEN_URL } from "./qq.constants";

/** 在 token 到期前提前这么久就刷新，避免边界竞态。 */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_TOKEN_TTL_SECONDS = 7200;

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * QQ 官方机器人的 HTTP 客户端：access_token 换取与缓存、网关接入点解析、
 * 以及群消息发送。全部为无状态 REST 调用，可独立单测。
 *
 * 未配置 QQ_APP_ID / QQ_APP_SECRET 时 `configured` 为 false，此时任何调用
 * 都会抛出 503（QQ_NOT_CONFIGURED），由调用方决定是否降级。
 */
@Injectable()
export class QqClientService {
  private readonly logger = new Logger(QqClientService.name);

  private readonly appId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private readonly apiBase: string;

  private cachedToken: CachedToken | null = null;

  constructor(config: ConfigService) {
    this.appId = config.get<string>("QQ_APP_ID", "") ?? "";
    this.clientSecret = config.get<string>("QQ_APP_SECRET", "") ?? "";
    this.tokenUrl =
      config.get<string>("QQ_TOKEN_URL", QQ_TOKEN_URL) ?? QQ_TOKEN_URL;
    this.apiBase = config.get<string>("QQ_API_BASE", QQ_API_BASE) ?? QQ_API_BASE;
  }

  get configured(): boolean {
    return Boolean(this.appId && this.clientSecret);
  }

  async getAccessToken(): Promise<string> {
    this.ensureConfigured();

    if (
      this.cachedToken &&
      Date.now() < this.cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS
    ) {
      return this.cachedToken.token;
    }

    const token = await this.fetchAccessToken();
    return token;
  }

  /** 获取 WebSocket 网关接入点（wss://...）。 */
  async resolveGatewayUrl(): Promise<string> {
    this.ensureConfigured();
    const token = await this.getAccessToken();

    let response: Response;
    try {
      response = await fetch(`${this.apiBase}/gateway/bot`, {
        headers: { Authorization: `QQBot ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 502,
        message: "无法连接 QQ 开放平台（获取网关接入点失败）",
        code: "QQ_GATEWAY_NETWORK_ERROR"
      });
    }

    const body = (await response.json()) as { url?: string };
    if (!response.ok || !body.url) {
      throw new ServiceUnavailableException({
        statusCode: 502,
        message: `QQ 获取网关接入点失败 (${response.status})`,
        code: "QQ_GATEWAY_FAILED"
      });
    }
    return body.url;
  }

  /** 向指定群发送纯文本消息。 */
  async sendGroupMessage(groupOpenid: string, text: string): Promise<void> {
    this.ensureConfigured();
    const token = await this.getAccessToken();

    let response: Response;
    try {
      response = await fetch(
        `${this.apiBase}/v2/groups/${encodeURIComponent(groupOpenid)}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `QQBot ${token}`
          },
          body: JSON.stringify({ msg_type: 0, content: text }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }
      );
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 502,
        message: "无法连接 QQ 开放平台（发送群消息失败）",
        code: "QQ_SEND_NETWORK_ERROR"
      });
    }

    if (!response.ok) {
      const bodyText = await response.text();
      throw new ServiceUnavailableException({
        statusCode: 502,
        message: `QQ 发送群消息失败 (${response.status}): ${bodyText}`,
        code: "QQ_SEND_FAILED"
      });
    }

    this.logger.log(`QQ group message sent to ${groupOpenid}`);
  }

  private async fetchAccessToken(): Promise<string> {
    let response: Response;
    try {
      response = await fetch(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: this.appId,
          clientSecret: this.clientSecret
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 502,
        message: "无法连接 QQ 开放平台（获取 access_token 失败）",
        code: "QQ_TOKEN_NETWORK_ERROR"
      });
    }

    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!response.ok || !body.access_token) {
      throw new ServiceUnavailableException({
        statusCode: 502,
        message: `QQ 获取 access_token 失败 (${response.status})`,
        code: "QQ_TOKEN_FAILED"
      });
    }

    const expiresIn = Number(body.expires_in) || DEFAULT_TOKEN_TTL_SECONDS;
    this.cachedToken = {
      token: body.access_token,
      expiresAt: Date.now() + expiresIn * 1000
    };
    return body.access_token;
  }

  private ensureConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: "QQ 机器人未配置（缺少 QQ_APP_ID / QQ_APP_SECRET）",
        code: "QQ_NOT_CONFIGURED"
      });
    }
  }
}
