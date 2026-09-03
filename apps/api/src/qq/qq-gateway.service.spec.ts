import { QqGatewayService } from "./qq-gateway.service";
import type { QqClientService } from "./qq-client.service";

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  emitOpen(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  emitMessage(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

describe("QqGatewayService", () => {
  const resolveGatewayUrl = jest.fn();
  const getAccessToken = jest.fn();
  const client = {
    configured: true,
    resolveGatewayUrl,
    getAccessToken
  } as unknown as QqClientService;

  const realWebSocket = globalThis.WebSocket;
  let gateway: QqGatewayService;

  beforeEach(() => {
    jest.useFakeTimers();
    resolveGatewayUrl.mockReset();
    getAccessToken.mockReset();
    FakeWebSocket.instances = [];
    resolveGatewayUrl.mockResolvedValue("wss://gateway.example/ws");
    getAccessToken.mockResolvedValue("tok123");
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    gateway = new QqGatewayService(client);
  });

  afterEach(() => {
    void gateway.onModuleDestroy();
    jest.useRealTimers();
    globalThis.WebSocket = realWebSocket;
  });

  it("stays idle when the bot is not configured", async () => {
    const idleClient = {
      configured: false,
      resolveGatewayUrl,
      getAccessToken
    } as unknown as QqClientService;
    const idle = new QqGatewayService(idleClient);

    await idle.onModuleInit();

    expect(resolveGatewayUrl).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("connects to the gateway and answers Hello with Identify", async () => {
    await gateway.onModuleInit();

    expect(resolveGatewayUrl).toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(1);

    const ws = FakeWebSocket.instances[0];
    expect(ws?.url).toBe("wss://gateway.example/ws");

    ws?.emitOpen();
    ws?.emitMessage({ op: 10, d: { heartbeat_interval: 45000 } });

    const identify = ws?.sent.find((m) => JSON.parse(m).op === 2);
    expect(identify).toBeDefined();

    const parsed = JSON.parse(identify as string) as {
      op: number;
      d: { token: string; intents: number; shard: [number, number] };
    };
    expect(parsed.d.token).toBe("QQBot tok123");
    expect(parsed.d.intents).toBe(1 << 25);
    expect(parsed.d.shard).toEqual([0, 1]);
  });

  it("records the group openid from GROUP_ADD_ROBOT", async () => {
    await gateway.onModuleInit();
    const ws = FakeWebSocket.instances[0];
    ws?.emitOpen();
    ws?.emitMessage({ op: 10, d: { heartbeat_interval: 45000 } });
    ws?.emitMessage({
      op: 0,
      s: 1,
      t: "GROUP_ADD_ROBOT",
      d: { group_openid: "A1B2C3D4" }
    });

    expect(gateway.groups).toContain("A1B2C3D4");
  });

  it("sends a heartbeat carrying the last sequence number", async () => {
    await gateway.onModuleInit();
    const ws = FakeWebSocket.instances[0];
    ws?.emitOpen();
    ws?.emitMessage({ op: 10, d: { heartbeat_interval: 1000 } });
    ws?.emitMessage({
      op: 0,
      s: 7,
      t: "READY",
      d: { session_id: "session_1" }
    });

    jest.advanceTimersByTime(1000);

    const heartbeat = ws?.sent.find((m) => JSON.parse(m).op === 1);
    expect(heartbeat).toBeDefined();
    expect((JSON.parse(heartbeat as string) as { d: number | null }).d).toBe(7);
  });

  it("reports online status once the socket is open", async () => {
    await gateway.onModuleInit();
    expect(gateway.isOnline).toBe(false);

    FakeWebSocket.instances[0]?.emitOpen();
    expect(gateway.isOnline).toBe(true);
  });
});
