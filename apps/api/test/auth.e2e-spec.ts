import {
  INestApplication,
  RequestMethod,
  ValidationPipe
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

// Deterministic credentials for the auth e2e suite. ConfigModule reads these
// from process.env (set before module compilation); the .env file values would
// also work, but pinning them here keeps the test independent of env drift.
process.env.ADMIN_USERNAME = "e2e-admin";
process.env.ADMIN_PASSWORD = "e2e-password";
process.env.AUTH_SECRET = "e2e-secret-key";

describe("Auth (e2e)", () => {
  let app: INestApplication;

  const prismaMock = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined)
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

  describe("POST /api/auth/login", () => {
    it("rejects wrong password with 401", async () => {
      await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ username: "e2e-admin", password: "nope" })
        .expect(401);
    });

    it("rejects unknown user with 401", async () => {
      await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ username: "ghost", password: "e2e-password" })
        .expect(401);
    });

    it("returns a token for valid credentials", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ username: "e2e-admin", password: "e2e-password" })
        .expect(201);

      expect(res.body.data.token).toEqual(expect.any(String));
      expect(res.body.data.expiresIn).toBe(2592000);
    });
  });

  describe("protected routes", () => {
    it("blocks /api/messages without a token (401)", async () => {
      await request(app.getHttpServer())
        .get("/api/messages")
        .expect(401);
    });

    it("blocks /api/monitors with a bad token (401)", async () => {
      await request(app.getHttpServer())
        .get("/api/monitors")
        .set("Authorization", "Bearer not-a-real-token")
        .expect(401);
    });

    it("allows /api/auth/me with a valid token", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ username: "e2e-admin", password: "e2e-password" })
        .expect(201);
      const token = login.body.data.token as string;

      const res = await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(res.body.data.username).toBe("e2e-admin");
    });

    it("passes the guard for business routes with a valid token", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ username: "e2e-admin", password: "e2e-password" })
        .expect(201);
      const token = login.body.data.token as string;

      // /api/monitors passes the guard; Prisma is mocked so it may error,
      // but the key assertion is that it is NOT a 401.
      const res = await request(app.getHttpServer())
        .get("/api/monitors")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).not.toBe(401);
    });
  });
});
