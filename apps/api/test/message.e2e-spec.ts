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
import type { NormalizedMessage } from "@social-monitor/types";
import { AppModule } from "../src/app.module";
import { MessageService } from "../src/messages/message.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { NotificationQueueService } from "../src/queue/notification-queue.service";

type TargetRow = {
  id: string;
  type: string;
  name: string;
  externalId: string;
  lastMessageAt: Date | null;
};

type MessageRow = {
  id: string;
  source: string;
  externalId: string;
  targetId: string;
  authorExternalId: string | null;
  authorUsername: string | null;
  authorName: string | null;
  content: string;
  url: string | null;
  publishedAt: Date;
  target: { id: string; name: string } | undefined;
};

type TaskRow = {
  id: string;
  messageId: string;
  channelId: string;
  channel: { id: string; name: string; type: string };
  status: string;
  attempts: number;
  sentAt: Date | null;
  createdAt: Date;
};

type ChannelRow = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
};

type MessageWhere = {
  source?: string;
  targetId?: string;
  OR?: Array<{
    content?: { contains?: string };
    authorUsername?: { contains?: string };
    authorName?: { contains?: string };
    authorExternalId?: { contains?: string };
  }>;
  publishedAt?: {
    gte?: Date;
    lte?: Date;
  };
};

describe("MessageController (e2e)", () => {
  let app: INestApplication;
  let authToken = "";
  let service: MessageService;

  const db: {
    targets: TargetRow[];
    messages: MessageRow[];
    tasks: TaskRow[];
    channels: ChannelRow[];
  } = {
    targets: [],
    messages: [],
    tasks: [],
    channels: []
  };
  let seq = 0;

  const seedTarget = (): TargetRow => {
    const row: TargetRow = {
      id: "target_1",
      type: "TG_CHANNEL",
      name: "OpenAI News",
      externalId: "-100123",
      lastMessageAt: null
    };
    db.targets.push(row);
    return row;
  };

  const makeInput = (overrides: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
    source: "TELEGRAM",
    externalId: "-100123:456",
    targetExternalId: "-100123",
    targetType: "TG_CHANNEL",
    targetName: "OpenAI News",
    author: { externalId: "123", username: "openai", displayName: "OpenAI" },
    content: "OpenAI announces GPT-5",
    url: "https://t.me/openai_news/456",
    publishedAt: new Date("2026-09-02T10:00:00.000Z"),
    ...overrides
  });

  const filterMessages = (where?: MessageWhere): MessageRow[] => {
    let list = [...db.messages];
    if (!where) {
      return list;
    }
    if (where.source) {
      list = list.filter((m) => m.source === where.source);
    }
    if (where.targetId) {
      list = list.filter((m) => m.targetId === where.targetId);
    }
    if (where.OR) {
      const kw = String(where.OR[0]?.content?.contains ?? "").toLowerCase();
      list = list.filter(
        (m) =>
          m.content.toLowerCase().includes(kw) ||
          (m.authorUsername ?? "").toLowerCase().includes(kw) ||
          (m.authorName ?? "").toLowerCase().includes(kw) ||
          (m.authorExternalId ?? "").toLowerCase().includes(kw)
      );
    }
    if (where.publishedAt) {
      const { gte, lte } = where.publishedAt;
      if (gte) {
        list = list.filter((m) => m.publishedAt >= gte);
      }
      if (lte) {
        list = list.filter((m) => m.publishedAt <= lte);
      }
    }
    return list;
  };

  const prismaMock = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    monitorTarget: {
      findUnique: jest.fn(async ({ where }) => {
        if (where.type_externalId) {
          return (
            db.targets.find(
              (t) =>
                t.type === where.type_externalId.type &&
                t.externalId === where.type_externalId.externalId
            ) ?? null
          );
        }
        if (where.id) {
          return db.targets.find((t) => t.id === where.id) ?? null;
        }
        return null;
      }),
      update: jest.fn(async ({ where, data }) => {
        const t = db.targets.find((x) => x.id === where.id);
        if (t) {
          Object.assign(t, data);
        }
        return t;
      })
    },
    message: {
      findMany: jest.fn(async ({ where, skip = 0, take = 20 }) => {
        const list = filterMessages(where).sort(
          (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
        );
        return list.slice(skip, skip + take);
      }),
      count: jest.fn(async ({ where }) => filterMessages(where).length),
      findUnique: jest.fn(async ({ where }) => {
        if (where.id) {
          return db.messages.find((m) => m.id === where.id) ?? null;
        }
        if (where.source_externalId) {
          return (
            db.messages.find(
              (m) =>
                m.source === where.source_externalId.source &&
                m.externalId === where.source_externalId.externalId
            ) ?? null
          );
        }
        return null;
      }),
      create: jest.fn(async ({ data }) => {
        seq += 1;
        const target = db.targets.find((t) => t.id === data.targetId);
        const row: MessageRow = {
          id: `msg_${seq}`,
          source: data.source,
          externalId: data.externalId,
          targetId: data.targetId,
          authorExternalId: data.authorExternalId,
          authorUsername: data.authorUsername,
          authorName: data.authorName,
          content: data.content,
          url: data.url,
          publishedAt: data.publishedAt,
          target: target ? { id: target.id, name: target.name } : undefined
        };
        db.messages.push(row);
        return row;
      })
    },
    notificationTask: {
      findMany: jest.fn(async ({ where }) =>
        db.tasks.filter((t) => t.messageId === where.messageId)
      ),
      createManyAndReturn: jest.fn(async ({ data }) => {
        const existing = new Set(
          db.tasks.map((t) => `${t.messageId}:${t.channelId}`)
        );
        const created: TaskRow[] = [];
        for (const item of data) {
          const key = `${item.messageId}:${item.channelId}`;
          if (existing.has(key)) {
            continue;
          }
          existing.add(key);
          const ch = db.channels.find((c) => c.id === item.channelId);
          seq += 1;
          const row: TaskRow = {
            id: `task_${seq}`,
            messageId: item.messageId,
            channelId: item.channelId,
            channel: ch
              ? { id: ch.id, name: ch.name, type: ch.type }
              : { id: item.channelId, name: "", type: "" },
            status: "PENDING",
            attempts: 0,
            sentAt: null,
            createdAt: new Date()
          };
          db.tasks.push(row);
          created.push(row);
        }
        return created;
      })
    },
    notificationChannel: {
      findMany: jest.fn(async ({ where }) => {
        if (where?.enabled !== undefined) {
          return db.channels.filter((c) => c.enabled === where.enabled);
        }
        return db.channels;
      })
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(NotificationQueueService)
      .useValue({ enqueueTask: jest.fn().mockResolvedValue(undefined) })
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

    service = app.get(MessageService);
  });

  beforeEach(() => {
    db.targets = [];
    db.messages = [];
    db.tasks = [];
    db.channels = [];
    seq = 0;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a message and lists it", async () => {
    seedTarget();
    await service.create(makeInput());

    const res = await request(app.getHttpServer())
      .get("/api/messages")
      .expect(200);

    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      source: "TELEGRAM",
      target: { id: "target_1", name: "OpenAI News" },
      content: "OpenAI announces GPT-5"
    });
  });

  it("does not create duplicate for same source+externalId", async () => {
    seedTarget();
    await service.create(makeInput());
    await service.create(makeInput());

    const res = await request(app.getHttpServer())
      .get("/api/messages")
      .expect(200);

    expect(res.body.meta.total).toBe(1);
  });

  it("filters by source", async () => {
    seedTarget();
    await service.create(makeInput());

    const res = await request(app.getHttpServer())
      .get("/api/messages")
      .query({ source: "TELEGRAM" })
      .expect(200);

    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].source).toBe("TELEGRAM");
  });

  it("searches by keyword", async () => {
    seedTarget();
    await service.create(makeInput());

    const res = await request(app.getHttpServer())
      .get("/api/messages")
      .query({ keyword: "GPT-5" })
      .expect(200);

    expect(res.body.meta.total).toBe(1);
  });

  it("gets a single message by id", async () => {
    seedTarget();
    const created = await service.create(makeInput());

    const res = await request(app.getHttpServer())
      .get(`/api/messages/${created.id}`)
      .expect(200);

    expect(res.body.data).toMatchObject({
      id: created.id,
      source: "TELEGRAM",
      author: {
        externalId: "123",
        username: "openai",
        displayName: "OpenAI"
      }
    });
  });

  it("returns 404 for missing message", async () => {
    await request(app.getHttpServer()).get("/api/messages/nope").expect(404);
  });

  it("lists notifications for a message", async () => {
    seedTarget();
    const created = await service.create(makeInput());
    db.tasks.push({
      id: "task_1",
      messageId: created.id,
      channelId: "ch_1",
      channel: { id: "ch_1", name: "Telegram Bot", type: "TELEGRAM" },
      status: "SENT",
      attempts: 1,
      sentAt: new Date("2026-09-02T10:01:00.000Z"),
      createdAt: new Date("2026-09-02T10:00:00.000Z")
    });

    const res = await request(app.getHttpServer())
      .get(`/api/messages/${created.id}/notifications`)
      .expect(200);

    expect(res.body.data).toEqual([
      {
        id: "task_1",
        channel: { id: "ch_1", name: "Telegram Bot", type: "TELEGRAM" },
        status: "SENT",
        attempts: 1,
        sentAt: "2026-09-02T10:01:00.000Z"
      }
    ]);
  });

  it("creates notification tasks for each enabled channel on message save", async () => {
    seedTarget();
    db.channels.push(
      { id: "ch_1", name: "Telegram Bot", type: "TELEGRAM", enabled: true },
      { id: "ch_2", name: "企业微信", type: "WECHAT", enabled: true },
      { id: "ch_3", name: "Disabled", type: "TELEGRAM", enabled: false }
    );

    const created = await service.create(makeInput());

    const tasks = db.tasks.filter((t) => t.messageId === created.id);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.channelId).sort()).toEqual(["ch_1", "ch_2"]);
  });

  it("creates notification tasks idempotently (no duplicates on repeated save)", async () => {
    seedTarget();
    db.channels.push({
      id: "ch_1",
      name: "Telegram Bot",
      type: "TELEGRAM",
      enabled: true
    });

    const created = await service.create(makeInput());
    await service.create(makeInput());

    const tasks = db.tasks.filter((t) => t.messageId === created.id);
    expect(tasks).toHaveLength(1);
  });
});
