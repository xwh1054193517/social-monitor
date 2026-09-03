/**
 * QQ 官方机器人（https://q.qq.com）接入常量与类型。
 *
 * 官方机器人采用「access_token + WebSocket 网关 + REST API」：
 * - token 通过 appId/clientSecret 换取，有效期约 2 小时；
 * - 网关通过 WebSocket 长连接接收事件（GROUP_ADD_ROBOT 等）并保持在线；
 * - 群消息通过 REST `POST /v2/groups/{group_openid}/messages` 发送。
 */

/** 获取 access_token 的接口（独立域名，与 API 基址不同）。 */
export const QQ_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";

/** 开放平台 REST API 基址（网关 / 群消息接口都在此域下）。 */
export const QQ_API_BASE = "https://api.sgroup.qq.com";

/** 群聊与 C2C 事件订阅位（GROUP_AND_C2C_EVENT = 1 << 25）。 */
export const QQ_INTENTS_GROUP = 1 << 25;

/** WebSocket 网关 OpCode。 */
export enum QQOpcode {
  Dispatch = 0,
  Heartbeat = 1,
  Identify = 2,
  Resume = 6,
  Reconnect = 7,
  InvalidSession = 9,
  Hello = 10,
  HeartbeatAck = 11
}

/** 机器人被拉入群聊（携带 group_openid）。 */
export const QQ_EVENT_GROUP_ADD_ROBOT = "GROUP_ADD_ROBOT";
export const QQ_EVENT_READY = "READY";
export const QQ_EVENT_RESUMED = "RESUMED";

/** 网关上行/下行统一载荷结构。 */
export interface QQGatewayPayload {
  op: number;
  d?: unknown;
  s?: number;
  t?: string;
  id?: string;
}

/** Identify（op 2）的 data 结构。 */
export interface QQIdentifyData {
  token: string;
  intents: number;
  shard: [number, number];
  properties: { $os: string; $browser: string; $device: string };
}
