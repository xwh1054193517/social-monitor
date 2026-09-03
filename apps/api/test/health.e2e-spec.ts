import {
  INestApplication,
  RequestMethod,
  ValidationPipe
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("HealthController", () => {
  let app: INestApplication;

  const prismaMock = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }])
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns service health with dependency checks", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);

    expect(res.body.data).toMatchObject({
      status: "ok",
      service: "social-monitor-api"
    });
    expect(res.body.data.checks).toMatchObject({
      postgresql: "up",
      x: "not_configured",
      wechat: "not_configured"
    });
    expect(res.body.data.checks).toHaveProperty("redis");
    expect(res.body.data.checks).toHaveProperty("telegram");
    expect(res.body.data.checks).toHaveProperty("telegram_bot");
  });

  it("returns database health via SELECT 1", async () => {
    await request(app.getHttpServer())
      .get("/health/db")
      .expect(200)
      .expect({
        data: {
          database: "connected"
        }
      });
  });
});
