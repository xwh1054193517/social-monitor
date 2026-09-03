import {
  BadRequestException,
  ConflictException,
  NotFoundException
} from "@nestjs/common";
import { SseService } from "../events/sse.service";
import { MonitorRepository } from "./monitor.repository";
import { MonitorService } from "./monitor.service";

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "mon_1",
  type: "X_USER",
  name: "OpenAI",
  username: "OpenAI",
  externalId: "OpenAI",
  enabled: true,
  lastMessageAt: null,
  ...overrides
});

describe("MonitorService", () => {
  let service: MonitorService;
  let repo: {
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
    findUniqueByTypeExternalId: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findUniqueByTypeExternalId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };
    service = new MonitorService(
      repo as unknown as MonitorRepository,
      { emit: jest.fn() } as unknown as SseService
    );
  });

  describe("list", () => {
    it("returns paginated data with filters", async () => {
      repo.findMany.mockResolvedValue([makeRecord()]);
      repo.count.mockResolvedValue(1);

      const result = await service.list({
        page: 1,
        pageSize: 20,
        type: "X_USER",
        keyword: "open"
      });

      expect(result).toEqual({
        data: [
          {
            id: "mon_1",
            type: "X_USER",
            name: "OpenAI",
            username: "OpenAI",
            externalId: "OpenAI",
            enabled: true,
            lastMessageAt: null
          }
        ],
        meta: { page: 1, pageSize: 20, total: 1 }
      });
      expect(repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 })
      );
    });
  });

  describe("create", () => {
    it("falls back externalId to username for X_USER", async () => {
      repo.findUniqueByTypeExternalId.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeRecord());

      const result = await service.create({
        type: "X_USER",
        name: "OpenAI",
        username: "OpenAI"
      });

      expect(repo.create).toHaveBeenCalledWith({
        type: "X_USER",
        name: "OpenAI",
        username: "OpenAI",
        externalId: "OpenAI"
      });
      expect(result.data.externalId).toBe("OpenAI");
    });

    it("rejects TG_CHANNEL without externalId", async () => {
      await expect(
        service.create({ type: "TG_CHANNEL", name: "Channel" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects X_USER without username or externalId", async () => {
      await expect(
        service.create({ type: "X_USER", name: "NoId" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects duplicate type+externalId", async () => {
      repo.findUniqueByTypeExternalId.mockResolvedValue(makeRecord());
      await expect(
        service.create({ type: "X_USER", name: "OpenAI", username: "OpenAI" })
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("findOne", () => {
    it("returns dto when found", async () => {
      repo.findUnique.mockResolvedValue(makeRecord());
      const result = await service.findOne("mon_1");
      expect(result.data.id).toBe("mon_1");
    });

    it("throws NotFound when missing", async () => {
      repo.findUnique.mockResolvedValue(null);
      await expect(service.findOne("missing")).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe("update / remove / setEnabled", () => {
    it("throws NotFound when target missing", async () => {
      repo.findUnique.mockResolvedValue(null);
      await expect(service.update("missing", { name: "x" })).rejects.toBeInstanceOf(
        NotFoundException
      );
      await expect(service.remove("missing")).rejects.toBeInstanceOf(
        NotFoundException
      );
      await expect(service.setEnabled("missing", true)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it("updates only provided fields", async () => {
      repo.findUnique.mockResolvedValue(makeRecord());
      repo.update.mockResolvedValue(makeRecord({ name: "OpenAI Official" }));
      await service.update("mon_1", { name: "OpenAI Official" });
      expect(repo.update).toHaveBeenCalledWith("mon_1", {
        name: "OpenAI Official"
      });
    });
  });

  describe("check", () => {
    it("valid for X_USER with username", async () => {
      repo.findUnique.mockResolvedValue(makeRecord());
      const result = await service.check("mon_1");
      expect(result.data).toEqual({ valid: true, name: "OpenAI" });
    });

    it("invalid for X_USER without username/externalId", async () => {
      repo.findUnique.mockResolvedValue(
        makeRecord({ username: null, externalId: "" })
      );
      const result = await service.check("mon_1");
      expect(result.data.valid).toBe(false);
    });
  });
});
