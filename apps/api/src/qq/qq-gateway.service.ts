import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import {
  QQ_EVENT_GROUP_ADD_ROBOT,
  QQ_EVENT_READY,
  QQ_EVENT_RESUMED,
  QQ_INTENTS_GROUP,
  QQOpcode
} from "./qq.constants";
import type {
  QQGatewayPayload,
  QQIdentifyData
} from "./qq.constants";
import { QqClientService } from "./qq-client.service";

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 60_000;
const DEFAULT_HEARTBEAT_MS = 45_000;

/**
 * QQ 官方机器人的 WebSocket 网关客户端。
 *
 * 官方要求机器人通过 WebSocket 常驻在线才能下发主动消息，因此本服务在应用
 * 启动时（配置了 QQ_APP_ID/QQ_APP_SECRET 时）自动建立连接，并维护心跳、
 * 断线重连与会话。事件方面目前只关心 GROUP_ADD_ROBOT —— 用来自动捕获群
 * 的 group_openid（发群消息的地址不是群号，而是这个 openid）。
 */
@Injectable()
export class QqGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QqGatewayService.name);

  private ws: WebSocket | null = null;
  private authToken = "";
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval = DEFAULT_HEARTBEAT_MS;
  private sessionId: string | null = null;
  private lastSeq: number | null = null;
  private reconnectAttempts = 0;
  private shuttingDown = false;

  private readonly knownGroups = new Set<string>();

  constructor(private readonly client: QqClientService) {}

  get isOnline(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** 已捕获到的群 openid（机器人被拉进群后由 GROUP_ADD_ROBOT 事件填充）。 */
  get groups(): string[] {
    return [...this.knownGroups];
  }

  async onModuleInit(): Promise<void> {
    if (!this.client.configured) {
      this.logger.warn(
        "QQ 机器人未配置（QQ_APP_ID / QQ_APP_SECRET），网关保持待机。"
      );
      return;
    }
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* best-effort */
      }
      this.ws = null;
    }
  }

  async connect(): Promise<void> {
    let url: string;
    try {
      url = await this.client.resolveGatewayUrl();
      this.authToken = `QQBot ${await this.client.getAccessToken()}`;
    } catch (error) {
      this.logger.error(`QQ 网关连接准备失败：${String(error)}`);
      this.scheduleReconnect();
      return;
    }

    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.logger.log("QQ 网关已连接，等待 Hello。");
    this.ws.onmessage = (event: MessageEvent) => this.handleMessage(event);
    this.ws.onerror = () => this.logger.warn("QQ 网关连接出错。");
    this.ws.onclose = () => this.handleClose();
  }

  private handleMessage(event: MessageEvent): void {
    let payload: QQGatewayPayload;
    try {
      payload = JSON.parse(String(event.data)) as QQGatewayPayload;
    } catch {
      return;
    }

    if (payload.op === QQOpcode.Hello) {
      const data = payload.d as { heartbeat_interval?: number } | undefined;
      this.heartbeatInterval = Number(data?.heartbeat_interval) || DEFAULT_HEARTBEAT_MS;
      this.startHeartbeat();
      this.identify();
      return;
    }

    if (payload.op === QQOpcode.Dispatch) {
      if (typeof payload.s === "number") {
        this.lastSeq = payload.s;
      }
      this.handleDispatch(payload.t ?? "", payload.d);
      return;
    }

    if (payload.op === QQOpcode.HeartbeatAck) {
      return;
    }

    if (payload.op === QQOpcode.Reconnect) {
      this.logger.log("QQ 网关要求重连。");
      this.closeAndReconnect();
      return;
    }

    if (payload.op === QQOpcode.InvalidSession) {
      this.logger.warn("QQ 会话失效，将重新鉴权。");
      this.sessionId = null;
      this.closeAndReconnect();
    }
  }

  private handleDispatch(type: string, data: unknown): void {
    if (type === QQ_EVENT_READY || type === QQ_EVENT_RESUMED) {
      const d = data as { session_id?: string } | undefined;
      if (d?.session_id) {
        this.sessionId = d.session_id;
      }
      this.reconnectAttempts = 0;
      this.logger.log(`QQ 网关已就绪（${type}）。`);
      return;
    }

    if (type === QQ_EVENT_GROUP_ADD_ROBOT) {
      const d = data as { group_openid?: string } | undefined;
      if (d?.group_openid) {
        this.knownGroups.add(d.group_openid);
        this.logger.log(
          `检测到 QQ 群：${d.group_openid}（请把此 openid 复制到 QQ 通知渠道配置）`
        );
      }
    }
  }

  private identify(): void {
    if (!this.authToken) {
      return;
    }
    const payload: QQIdentifyData = {
      token: this.authToken,
      intents: QQ_INTENTS_GROUP,
      shard: [0, 1],
      properties: {
        $os: "linux",
        $browser: "social-monitor",
        $device: "social-monitor"
      }
    };
    this.send({ op: QQOpcode.Identify, d: payload });
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ op: QQOpcode.Heartbeat, d: this.lastSeq });
    }, this.heartbeatInterval);
    this.heartbeatTimer.unref?.();
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(payload: QQGatewayPayload): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private closeAndReconnect(): void {
    this.clearHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* best-effort */
      }
      this.ws = null;
    }
    this.scheduleReconnect();
  }

  private handleClose(): void {
    this.clearHeartbeat();
    this.ws = null;
    if (this.shuttingDown) {
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.shuttingDown) {
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }
}
