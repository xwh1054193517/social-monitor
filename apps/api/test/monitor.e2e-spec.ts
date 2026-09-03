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

type Row = {
  id: string;
  type: string;
  name: string;
  username: string | null;
  externalId: string;
  enabled: boolean;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MonitorWhere = {
  type?: string;
  enabled?: boolean;
  OR?: Array<{
    name?: { contains?: string };
    username?: { contains?: string };
    externalId?: { contains?: string };
  }>;
};

describe("MonitorController (e2e)", () => {
  let app: INestApplication;
  let authToken = "";
  let rows: Row[];
  let seq: number;

  const makeRow = (data: Partial<Row> & { type: string; name: string; externalId: string }): Row => {
    seq += 1;
    return {
      id: `mon_${seq}`,
      username: null,
      enabled: true,
      lastMessageAt: null,
      createdAt: new Date("2026-09-02T10:00:00.000Z"),
      updatedAt: new Date("2026-09-02T10:00:00.000Z"),
      ...data
    };
  };

  const filterByWhere = (list: Row[], where?: MonitorWhere): Row[] => {
    let result = [...list];
    if (!where) {
      return result;
    }
    if (where.type) {
      result = result.filter((r) => r.type === where.type);
    }
    if (where.enabled !== undefined) {
      result = result.filter((r) => r.enabled === where.enabled);
    }
    if (where.OR) {
      const kw = String(where.OR[0]?.name?.contains ?? "").toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(kw) ||
          (r.username ?? "").toLowerCase().includes(kw) ||
          r.externalId.toLowerCase().includes(kw)
      );
    }
    return result;
  };

  const prismaMock = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    monitorTarget: {
      findMany: jest.fn(async ({ where, skip = 0, take = 20 }) => {
        return filterByWhere(rows, where).slice(skip, skip + take);
      }),
      count: jest.fn(async ({ where }) => filterByWhere(rows, where).length),
      findUnique: jest.fn(async ({ where }) => {
        if (where.id) {
          return rows.find((r) => r.id === where.id) ?? null;
        }
        if (where.type_externalId) {
          return (
            rows.find(
              (r) =>
                r.type === where.type_externalId.type &&
                r.externalId === where.type_externalId.externalId
            ) ?? null
          );
        }
        return null;
      }),
      create: jest.fn(async ({ data }) => {
        const row = makeRow(data);
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const idx = rows.findIndex((r) => r.id === where.id);
        if (idx < 0) {
          throw new Error("record not found");
        }
        rows[idx] = { ...rows[idx], ...data };
        return rows[idx];
      }),
      delete: jest.fn(async ({ where }) => {
        const idx = rows.findIndex((r) => r.id === where.id);
        const [removed] = rows.splice(idx, 1);
        return removed;
      })
    }
  };

  beforeAll(async () => {
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
    rows = [];
    seq = 0;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates an X_USER monitor", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "X_USER", name: "OpenAI", username: "OpenAI" })
      .expect(201);

    expect(res.body.data).toMatchObject({
      type: "X_USER",
      name: "OpenAI",
      username: "OpenAI",
      externalId: "OpenAI",
      enabled: true
    });
  });

  it("creates a TG_CHANNEL monitor", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "TG_CHANNEL", name: "OpenAI News", externalId: "-100123456789" })
      .expect(201);

    expect(res.body.data).toMatchObject({
      type: "TG_CHANNEL",
      name: "OpenAI News",
      externalId: "-100123456789"
    });
  });

  it("creates a TG_GROUP monitor", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "TG_GROUP", name: "Dev Group", externalId: "-100987654321" })
      .expect(201);

    expect(res.body.data.type).toBe("TG_GROUP");
  });

  it("rejects invalid body with 400", async () => {
    await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "INVALID_TYPE", name: "X" })
      .expect(400);
  });

  it("rejects TG_CHANNEL without externalId with 400", async () => {
    await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "TG_CHANNEL", name: "Missing chat" })
      .expect(400);
  });

  it("returns 409 on duplicate type+externalId", async () => {
    await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "X_USER", name: "OpenAI", username: "OpenAI" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "X_USER", name: "OpenAI Duplicate", username: "OpenAI" })
      .expect(409);
  });

  it("lists monitors with pagination meta", async () => {
    await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "X_USER", name: "OpenAI", username: "OpenAI" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/api/monitors")
      .query({ page: 1, pageSize: 20 })
      .expect(200);

    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(res.body.data).toHaveLength(1);
  });

  it("filters monitors by type", async () => {
    await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "X_USER", name: "OpenAI", username: "OpenAI" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "TG_CHANNEL", name: "OpenAI News", externalId: "-1001" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/api/monitors")
      .query({ type: "X_USER" })
      .expect(200);

    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].type).toBe("X_USER");
  });

  it("gets a single monitor by id", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "X_USER", name: "OpenAI", username: "OpenAI" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/monitors/${created.body.data.id}`)
      .expect(200);

    expect(res.body.data.name).toBe("OpenAI");
  });

  it("returns 404 for missing monitor", async () => {
    await request(app.getHttpServer()).get("/api/monitors/nope").expect(404);
  });

  it("updates a monitor via PATCH", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "X_USER", name: "OpenAI", username: "OpenAI" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .patch(`/api/monitors/${created.body.data.id}`)
      .send({ name: "OpenAI Official" })
      .expect(200);

    expect(res.body.data.name).toBe("OpenAI Official");
  });

  it("disables and enables a monitor", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "X_USER", name: "OpenAI", username: "OpenAI" })
      .expect(201);
    const id = created.body.data.id;

    const disabled = await request(app.getHttpServer())
      .post(`/api/monitors/${id}/disable`)
      .expect(201);
    expect(disabled.body.data.enabled).toBe(false);

    const enabled = await request(app.getHttpServer())
      .post(`/api/monitors/${id}/enable`)
      .expect(201);
    expect(enabled.body.data.enabled).toBe(true);
  });

  it("checks a monitor returns validity", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "TG_CHANNEL", name: "OpenAI News", externalId: "-1001" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/monitors/${created.body.data.id}/check`)
      .expect(201);

    expect(res.body.data).toEqual({ valid: true, name: "OpenAI News" });
  });

  it("deletes a monitor", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/monitors")
      .send({ type: "X_USER", name: "OpenAI", username: "OpenAI" })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/monitors/${created.body.data.id}`)
      .expect(200)
      .expect({ data: true });

    await request(app.getHttpServer())
      .get(`/api/monitors/${created.body.data.id}`)
      .expect(404);
  });
});
