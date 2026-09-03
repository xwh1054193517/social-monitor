import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SseService } from "../events/sse.service";
import { NotificationProviderFactory } from "./notification-provider.factory";
import { NotificationRepository } from "./notification.repository";
import { NotificationService } from "./notification.service";

const makeChannel = (overrides: Record<string, unknown> = {}) => ({
  id: "ch_1",
  name: "Telegram Bot",
  type: "TELEGRAM",
  enabled: true,
  config: { botToken: "secret-token", chatId: "123" },
  createdAt: new Date("2026-09-02T10:00:00.000Z"),
  ...overrides
});

const makeTask = (overrides: Record<string, unknown> = {}) => ({
  id: "task_1",
  messageId: "msg_1",
  channelId: "ch_1",
  channel: { id: "ch_1", name: "Telegram Bot", type: "TELEGRAM" },
  status: "PENDING",
  attempts: 0,
  lastError: null,
  sentAt: null,
  createdAt: new Date("2026-09-02T10:00:00.000Z"),
  ...overrides
});

const makeTaskWithRelations = (overrides: Record<string, unknown> = {}) => ({
  ...makeTask(),
  message: {
    id: "msg_1",
    source: "TELEGRAM",
    target: { name: "OpenAI News", type: "TG_CHANNEL" },
    content: "OpenAI announces GPT-5",
    url: "https://t.me/openai_news/456",
    publishedAt: new Date("2026-09-02T09:59:00.000Z")
  },
  ...overrides
});

describe("NotificationService", () => {
  let service: NotificationService;
  let repo: {
    findChannels: jest.Mock;
    findChannelById: jest.Mock;
    createChannel: jest.Mock;
    updateChannel: jest.Mock;
    deleteChannel: jest.Mock;
    findTasks: jest.Mock;
    countTasks: jest.Mock;
    findTaskWithRelations: jest.Mock;
    updateTask: jest.Mock;
  };
  let factory: { get: jest.Mock };
  let provider: { send: jest.Mock };

  beforeEach(() => {
    repo = {
      findChannels: jest.fn(),
      findChannelById: jest.fn(),
      createChannel: jest.fn(),
      updateChannel: jest.fn(),
      deleteChannel: jest.fn(),
      findTasks: jest.fn(),
      countTasks: jest.fn(),
      findTaskWithRelations: jest.fn(),
      updateTask: jest.fn()
    };
    provider = { send: jest.fn().mockResolvedValue(undefined) };
    factory = { get: jest.fn().mockReturnValue(provider) };
    service = new NotificationService(
      repo as unknown as NotificationRepository,
      factory as unknown as NotificationProviderFactory,
      { emit: jest.fn() } as unknown as SseService
    );
  });

  describe("channels", () => {
    it("masks config and never leaks secrets", async () => {
      repo.findChannels.mockResolvedValue([makeChannel()]);

      const result = await service.listChannels({});

      expect(result.data[0]).toEqual({
        id: "ch_1",
        name: "Telegram Bot",
        type: "TELEGRAM",
        enabled: true,
        config: { configured: true }
      });
      expect(JSON.stringify(result)).not.toContain("secret-token");
    });

    it("filters channels by type and enabled", async () => {
      repo.findChannels.mockResolvedValue([]);

      await service.listChannels({ type: "TELEGRAM", enabled: true });

      expect(repo.findChannels).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: "TELEGRAM", enabled: true }
        })
      );
    });

    it("creates a channel and masks its config in response", async () => {
      repo.createChannel.mockResolvedValue(makeChannel());

      const result = await service.createChannel({
        name: "Telegram Bot",
        type: "TELEGRAM",
        config: { botToken: "secret-token", chatId: "123" }
      });

      expect(repo.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Telegram Bot",
          type: "TELEGRAM",
          config: { botToken: "secret-token", chatId: "123" }
        })
      );
      expect(result.data.config).toEqual({ configured: true });
    });

    it("rejects TELEGRAM channel without botToken/chatId", async () => {
      await expect(
        service.createChannel({
          name: "Telegram Bot",
          type: "TELEGRAM",
          config: { botToken: "secret-token" }
        })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.createChannel).not.toHaveBeenCalled();
    });

    it("rejects WECHAT channel without webhookUrl", async () => {
      await expect(
        service.createChannel({
          name: "企业微信",
          type: "WECHAT",
          config: {}
        })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.createChannel).not.toHaveBeenCalled();
    });

    it("accepts a valid WECHAT channel", async () => {
      repo.createChannel.mockResolvedValue(
        makeChannel({
          type: "WECHAT",
          name: "企业微信",
          config: { webhookUrl: "https://example.com/hook" }
        })
      );

      const result = await service.createChannel({
        name: "企业微信",
        type: "WECHAT",
        config: { webhookUrl: "https://example.com/hook" }
      });

      expect(result.data.type).toBe("WECHAT");
    });

    it("returns 404 when channel missing", async () => {
      repo.findChannelById.mockResolvedValue(null);

      await expect(service.getChannel("nope")).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it("updates a channel", async () => {
      repo.findChannelById.mockResolvedValue(makeChannel());
      repo.updateChannel.mockResolvedValue(
        makeChannel({ name: "Telegram Main", enabled: false })
      );

      const result = await service.updateChannel("ch_1", {
        name: "Telegram Main",
        enabled: false
      });

      expect(repo.updateChannel).toHaveBeenCalledWith("ch_1", {
        name: "Telegram Main",
        enabled: false
      });
      expect(result.data).toMatchObject({
        name: "Telegram Main",
        enabled: false
      });
    });

    it("removes a channel and returns true", async () => {
      repo.findChannelById.mockResolvedValue(makeChannel());
      repo.deleteChannel.mockResolvedValue(makeChannel());

      const result = await service.removeChannel("ch_1");

      expect(result).toEqual({ data: true });
    });

    it("testChannel sends through provider with test payload", async () => {
      repo.findChannelById.mockResolvedValue(makeChannel());

      const result = await service.testChannel("ch_1");

      expect(factory.get).toHaveBeenCalledWith("TELEGRAM");
      expect(provider.send).toHaveBeenCalledWith(
        { botToken: "secret-token", chatId: "123" },
        expect.objectContaining({ content: "Social Monitor 测试消息" })
      );
      expect(result).toEqual({ data: { success: true } });
    });
  });

  describe("tasks", () => {
    it("lists tasks with pagination and filters", async () => {
      repo.findTasks.mockResolvedValue([makeTaskWithRelations()]);
      repo.countTasks.mockResolvedValue(1);

      const result = await service.listTasks({
        page: 1,
        pageSize: 20,
        status: "PENDING",
        channelId: "ch_1"
      });

      expect(repo.findTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "PENDING", channelId: "ch_1" }
        })
      );
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.data[0]?.channel).toEqual({
        id: "ch_1",
        name: "Telegram Bot",
        type: "TELEGRAM"
      });
      expect(result.data[0]?.message).toEqual({
        id: "msg_1",
        targetName: "OpenAI News",
        content: "OpenAI announces GPT-5"
      });
    });

    it("returns 404 for missing task", async () => {
      repo.findTaskWithRelations.mockResolvedValue(null);

      await expect(service.getTask("nope")).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it("returns task detail with message summary", async () => {
      repo.findTaskWithRelations.mockResolvedValue(makeTaskWithRelations());

      const result = await service.getTask("task_1");

      expect(result.data.message).toEqual({
        id: "msg_1",
        source: "TELEGRAM",
        targetName: "OpenAI News",
        content: "OpenAI announces GPT-5",
        url: "https://t.me/openai_news/456",
        publishedAt: expect.any(Date)
      });
    });
  });

  describe("dispatch", () => {
    it("transitions PENDING -> PROCESSING -> SENT on success", async () => {
      repo.findTaskWithRelations.mockResolvedValue(makeTaskWithRelations());
      repo.updateTask.mockResolvedValue(undefined);

      await service.dispatch("task_1");

      expect(repo.updateTask).toHaveBeenNthCalledWith(1, "task_1", {
        status: "PROCESSING",
        attempts: { increment: 1 }
      });
      expect(provider.send).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          sourceLabel: "TG频道",
          targetName: "OpenAI News",
          author: "",
          content: "OpenAI announces GPT-5"
        })
      );
      expect(repo.updateTask).toHaveBeenNthCalledWith(2, "task_1", {
        status: "SENT",
        sentAt: expect.any(Date),
        lastError: null
      });
    });

    it("marks FAILED when provider throws", async () => {
      repo.findTaskWithRelations.mockResolvedValue(makeTaskWithRelations());
      repo.updateTask.mockResolvedValue(undefined);
      provider.send.mockRejectedValue(new Error("boom"));

      await service.dispatch("task_1");

      expect(repo.updateTask).toHaveBeenLastCalledWith("task_1", {
        status: "FAILED",
        lastError: "boom"
      });
    });

    it("includes the author for TG group messages but not channels", async () => {
      repo.findTaskWithRelations.mockResolvedValue(
        makeTaskWithRelations({
          message: {
            id: "msg_1",
            source: "TELEGRAM",
            target: { name: "Dev Chat", type: "TG_GROUP" },
            authorName: "张三",
            authorUsername: "zhangsan",
            content: "大家好",
            url: null,
            publishedAt: new Date("2026-09-02T09:59:00.000Z")
          }
        })
      );
      repo.updateTask.mockResolvedValue(undefined);

      await service.dispatch("task_1");

      expect(provider.send).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          sourceLabel: "TG群组",
          targetName: "Dev Chat",
          author: "张三",
          content: "大家好"
        })
      );

      // 频道消息：即使有 author 字段也不带发言人
      repo.findTaskWithRelations.mockResolvedValue(
        makeTaskWithRelations({
          message: {
            id: "msg_1",
            source: "TELEGRAM",
            target: { name: "OpenAI News", type: "TG_CHANNEL" },
            authorName: "OpenAI News",
            content: "发布公告",
            url: null,
            publishedAt: new Date("2026-09-02T09:59:00.000Z")
          }
        })
      );
      await service.dispatch("task_1");

      expect(provider.send).toHaveBeenLastCalledWith(
        undefined,
        expect.objectContaining({
          sourceLabel: "TG频道",
          author: ""
        })
      );
    });

    it("throws NotFound for missing task", async () => {
      repo.findTaskWithRelations.mockResolvedValue(null);

      await expect(service.dispatch("nope")).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(repo.updateTask).not.toHaveBeenCalled();
    });
  });

  describe("processTask", () => {
    it("rethrows the provider error after persisting FAILED (enables BullMQ retry)", async () => {
      repo.findTaskWithRelations.mockResolvedValue(makeTaskWithRelations());
      repo.updateTask.mockResolvedValue(undefined);
      provider.send.mockRejectedValue(new Error("boom"));

      await expect(service.processTask("task_1")).rejects.toThrow("boom");

      expect(repo.updateTask).toHaveBeenLastCalledWith("task_1", {
        status: "FAILED",
        lastError: "boom"
      });
    });

    it("fails twice then succeeds on third attempt -> SENT with attempts = 3", async () => {
      // Stateful fake repository that accumulates the attempts increment, so
      // this test mirrors the BullMQ worker calling processTask per retry.
      const state: Record<string, unknown> = {
        status: "PENDING",
        attempts: 0,
        lastError: null,
        sentAt: null
      };
      const repo2 = {
        findTaskWithRelations: jest.fn(async () => makeTaskWithRelations()),
        updateTask: jest.fn(
          async (
            _id: string,
            data: { status?: string; attempts?: { increment: number }; sentAt?: Date; lastError?: string | null }
          ) => {
            if (data.status) {
              state.status = data.status;
            }
            if (data.attempts?.increment) {
              state.attempts = Number(state.attempts) + data.attempts.increment;
            }
            if (data.sentAt) {
              state.sentAt = data.sentAt;
            }
            if (data.lastError !== undefined) {
              state.lastError = data.lastError;
            }
          }
        )
      };

      let calls = 0;
      const provider2 = {
        send: jest.fn(async () => {
          calls += 1;
          if (calls < 3) {
            throw new Error(`attempt ${calls} failed`);
          }
        })
      };
      const factory2 = { get: jest.fn().mockReturnValue(provider2) };
      const svc = new NotificationService(
        repo2 as unknown as NotificationRepository,
        factory2 as unknown as NotificationProviderFactory,
        { emit: jest.fn() } as unknown as SseService
      );

      await expect(svc.processTask("task_1")).rejects.toThrow(
        "attempt 1 failed"
      );
      await expect(svc.processTask("task_1")).rejects.toThrow(
        "attempt 2 failed"
      );
      await svc.processTask("task_1");

      expect(state.status).toBe("SENT");
      expect(state.attempts).toBe(3);
      expect(state.lastError).toBeNull();
    });
  });
});
