import {
  INestApplication,
  RequestMethod,
  ValidationPipe
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

// Deterministic admin credentials so the e2e suite can obtain a real token
// via /api/auth/login (ConfigModule reads these from process.env).
process.env.ADMIN_USERNAME = "e2e-admin";
process.env.ADMIN_PASSWORD = "e2e-password";
process.env.AUTH_SECRET = "e2e-secret-key";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

type ChannelRow = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
};

type TaskRow = {
  id: string;
  messageId: string;
  channelId: string;
  channel: { id: string; name: string; type: string };
  message: {
    id: string;
    source: string;
    target: { name: string };
    content: string;
    url: string | null;
    publishedAt: Date;
  };
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

describe("NotificationController (e2e)", () => {
  let app: INestApplication;
  let authToken = "";

  const db: { channels: ChannelRow[]; tasks: TaskRow[] } = {
    channels: [],
    tasks: []
  };
  let seq = 0;

  const filterChannels = (where?: {
    type?: string;
    enabled?: boolean;
  }): ChannelRow[] => {
    let list = [...db.channels];
    if (!where) {
      return list;
    }
    if (where.type) {
      list = list.filter((c) => c.type === where.type);
    }
    if (where.enabled !== undefined) {
      list = list.filter((c) => c.enabled === where.enabled);
    }
    return list;
  };

  const filterTasks = (where?: {
    status?: string;
    channelId?: string;
  }): TaskRow[] => {
    let list = [...db.tasks];
    if (!where) {
      return list;
    }
    if (where.status) {
      list = list.filter((t) => t.status === where.status);
    }
    if (where.channelId) {
      list = list.filter((t) => t.channelId === where.channelId);
    }
    return list;
  };

  const prismaMock = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    notificationChannel: {
      findMany: jest.fn(async ({ where }) =>
        filterChannels(where).sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )
      ),
      findUnique: jest.fn(async ({ where }) => {
        if (where.id) {
          return db.channels.find((c) => c.id === where.id) ?? null;
        }
        return null;
      }),
      create: jest.fn(async ({ data }) => {
        seq += 1;
        const row: ChannelRow = {
          id: `ch_${seq}`,
          name: data.name,
          type: data.type,
          enabled: data.enabled ?? true,
          config: data.config,
          createdAt: new Date("2026-09-02T10:00:00.000Z")
        };
        db.channels.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const idx = db.channels.findIndex((c) => c.id === where.id);
        if (idx < 0) {
          throw new Error("record not found");
        }
        db.channels[idx] = { ...db.channels[idx], ...data };
        return db.channels[idx];
      }),
      delete: jest.fn(async ({ where }) => {
        const idx = db.channels.findIndex((c) => c.id === where.id);
        const [removed] = db.channels.splice(idx, 1);
        return removed;
      })
    },
    notificationTask: {
      findMany: jest.fn(async ({ where, skip = 0, take = 20 }) => {
        return filterTasks(where)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take);
      }),
      count: jest.fn(async ({ where }) => filterTasks(where).length),
      findUnique: jest.fn(async ({ where }) => {
        return db.tasks.find((t) => t.id === where.id) ?? null;
      })
    }
  };

  beforeAll(async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => ""
    }) as unknown as typeof fetch;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api", {
      exclude: [
        { path: "health", method: RequestMethod.ALL },
        { path: "health/(.*)", method: RequestMethod.ALL }
      ]
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true
      })
    );
    // Inject the admin bearer token for every request so the global
    // AuthGuard is satisfied without touching each supertest call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use((req: any, _res: any, next: any) => {
      if (!req.headers.authorization && authToken) {
        req.headers.authorization = `Bearer ${authToken}`;
      }
      next();
    });

    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ username: "e2e-admin", password: "e2e-password" });
    authToken = loginRes.body.data.token as string;
  });

  beforeEach(() => {
    db.channels = [];
    db.tasks = [];
    seq = 0;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it("creates a TELEGRAM channel and masks config", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/notifications/channels")
      .send({
        name: "Telegram Bot",
        type: "TELEGRAM",
        config: { botToken: "secret-token", chatId: "123" }
      })
      .expect(201);

    expect(res.body.data).toEqual({
      id: "ch_1",
      name: "Telegram Bot",
      type: "TELEGRAM",
      enabled: true,
      config: { configured: true }
    });
    expect(JSON.stringify(res.body)).not.toContain("secret-token");
  });

  it("rejects a TELEGRAM channel with invalid config", async () => {
    await request(app.getHttpServer())
      .post("/api/notifications/channels")
      .send({ name: "Telegram Bot", type: "TELEGRAM", config: { botToken: "x" } })
      .expect(400);
  });

  it("lists channels without leaking config", async () => {
    await request(app.getHttpServer())
      .post("/api/notifications/channels")
      .send({
        name: "Telegram Bot",
        type: "TELEGRAM",
        config: { botToken: "secret", chatId: "123" }
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/notifications/channels")
      .send({
        name: "企业微信",
        type: "WECHAT",
        config: { webhookUrl: "https://example.com/hook" }
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/api/notifications/channels")
      .expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(JSON.stringify(res.body)).not.toContain("example.com");
  });

  it("gets a single channel by id", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/notifications/channels")
      .send({
        name: "Telegram Bot",
        type: "TELEGRAM",
        config: { botToken: "secret", chatId: "123" }
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/notifications/channels/${created.body.data.id}`)
      .expect(200);

    expect(res.body.data.config).toEqual({ configured: true });
  });

  it("returns 404 for missing channel", async () => {
    await request(app.getHttpServer())
      .get("/api/notifications/channels/nope")
      .expect(404);
  });

  it("updates a channel via PATCH", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/notifications/channels")
      .send({
        name: "Telegram Bot",
        type: "TELEGRAM",
        config: { botToken: "secret", chatId: "123" }
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/notifications/channels/${created.body.data.id}`)
      .send({ name: "Telegram Main", enabled: false })
      .expect(200);

    expect(res.body.data).toMatchObject({ name: "Telegram Main", enabled: false });
  });

  it("sends a test message through the provider", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/notifications/channels")
      .send({
        name: "Telegram Bot",
        type: "TELEGRAM",
        config: { botToken: "secret", chatId: "123" }
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/notifications/channels/${created.body.data.id}/test`)
      .expect(201);

    expect(res.body.data).toEqual({ success: true });
  });

  it("deletes a channel", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/notifications/channels")
      .send({
        name: "Telegram Bot",
        type: "TELEGRAM",
        config: { botToken: "secret", chatId: "123" }
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/notifications/channels/${created.body.data.id}`)
      .expect(200)
      .expect({ data: true });

    await request(app.getHttpServer())
      .get(`/api/notifications/channels/${created.body.data.id}`)
      .expect(404);
  });

  it("lists notification tasks", async () => {
    db.tasks.push({
      id: "task_1",
      messageId: "msg_1",
      channelId: "ch_1",
      channel: { id: "ch_1", name: "Telegram Bot", type: "TELEGRAM" },
      message: {
        id: "msg_1",
        source: "TELEGRAM",
        target: { name: "OpenAI News" },
        content: "hello",
        url: null,
        publishedAt: new Date("2026-09-02T09:59:00.000Z")
      },
      status: "PENDING",
      attempts: 0,
      lastError: null,
      sentAt: null,
      createdAt: new Date("2026-09-02T10:00:00.000Z")
    });

    const res = await request(app.getHttpServer())
      .get("/api/notifications/tasks")
      .expect(200);

    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      id: "task_1",
      status: "PENDING",
      channel: { id: "ch_1", name: "Telegram Bot", type: "TELEGRAM" }
    });
  });

  it("gets a task detail with message summary", async () => {
    db.tasks.push({
      id: "task_1",
      messageId: "msg_1",
      channelId: "ch_1",
      channel: { id: "ch_1", name: "Telegram Bot", type: "TELEGRAM" },
      message: {
        id: "msg_1",
        source: "TELEGRAM",
        target: { name: "OpenAI News" },
        content: "OpenAI announces GPT-5",
        url: "https://t.me/openai_news/456",
        publishedAt: new Date("2026-09-02T09:59:00.000Z")
      },
      status: "SENT",
      attempts: 1,
      lastError: null,
      sentAt: new Date("2026-09-02T10:01:00.000Z"),
      createdAt: new Date("2026-09-02T10:00:00.000Z")
    });

    const res = await request(app.getHttpServer())
      .get("/api/notifications/tasks/task_1")
      .expect(200);

    expect(res.body.data).toMatchObject({
      id: "task_1",
      status: "SENT",
      message: {
        id: "msg_1",
        source: "TELEGRAM",
        targetName: "OpenAI News"
      }
    });
  });

  it("returns 404 for missing task", async () => {
    await request(app.getHttpServer())
      .get("/api/notifications/tasks/nope")
      .expect(404);
  });
});
