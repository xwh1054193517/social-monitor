import { NotFoundException } from "@nestjs/common";
import type { NormalizedMessage } from "@social-monitor/types";
import { SseService } from "../events/sse.service";
import { NotificationQueueService } from "../queue/notification-queue.service";
import { MessageRepository } from "./message.repository";
import { MessageService } from "./message.service";

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "msg_1",
  source: "TELEGRAM",
  targetId: "target_1",
  authorExternalId: "123",
  authorUsername: "openai",
  authorName: "OpenAI",
  content: "OpenAI announces...",
  url: "https://t.me/openai_news/456",
  publishedAt: new Date("2026-09-02T10:00:00.000Z"),
  target: { id: "target_1", name: "OpenAI News" },
  ...overrides
});

const makeTarget = () => ({
  id: "target_1",
  type: "TG_CHANNEL",
  name: "OpenAI News",
  externalId: "-100123"
});

const makeChannel = (overrides: Record<string, unknown> = {}) => ({
  id: "ch_1",
  name: "Telegram Bot",
  type: "TELEGRAM",
  enabled: true,
  ...overrides
});

const input: NormalizedMessage = {
  source: "TELEGRAM",
  externalId: "-100123:456",
  targetExternalId: "-100123",
  targetType: "TG_CHANNEL",
  targetName: "OpenAI News",
  author: { externalId: "123", username: "openai", displayName: "OpenAI" },
  content: "OpenAI announces...",
  url: "https://t.me/openai_news/456",
  publishedAt: new Date("2026-09-02T10:00:00.000Z")
};

describe("MessageService", () => {
  let service: MessageService;
  let queue: { enqueueTask: jest.Mock };
  let repo: {
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
    findUniqueBySourceExternalId: jest.Mock;
    findTargetByTypeExternalId: jest.Mock;
    create: jest.Mock;
    updateTargetLastMessageAt: jest.Mock;
    findNotifications: jest.Mock;
    findEnabledNotificationChannels: jest.Mock;
    createNotificationTasks: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findUniqueBySourceExternalId: jest.fn(),
      findTargetByTypeExternalId: jest.fn(),
      create: jest.fn(),
      updateTargetLastMessageAt: jest.fn(),
      findNotifications: jest.fn(),
      findEnabledNotificationChannels: jest.fn(),
      createNotificationTasks: jest.fn()
    };
    queue = { enqueueTask: jest.fn().mockResolvedValue(undefined) };
    service = new MessageService(
      repo as unknown as MessageRepository,
      queue as unknown as NotificationQueueService,
      { emit: jest.fn() } as unknown as SseService
    );
  });

  describe("create", () => {
    it("creates a message and updates target lastMessageAt", async () => {
      repo.findTargetByTypeExternalId.mockResolvedValue(makeTarget());
      repo.findUniqueBySourceExternalId.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeRecord());
      repo.updateTargetLastMessageAt.mockResolvedValue(undefined);
      repo.findEnabledNotificationChannels.mockResolvedValue([]);

      const result = await service.create(input);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "TELEGRAM",
          externalId: "-100123:456",
          targetId: "target_1",
          authorExternalId: "123",
          authorUsername: "openai",
          authorName: "OpenAI",
          content: "OpenAI announces...",
          url: "https://t.me/openai_news/456",
          publishedAt: input.publishedAt
        })
      );
      expect(repo.updateTargetLastMessageAt).toHaveBeenCalledWith(
        "target_1",
        input.publishedAt
      );
      expect(result.id).toBe("msg_1");
      expect(result.target).toEqual({ id: "target_1", name: "OpenAI News" });
      expect(result.author).toEqual({
        externalId: "123",
        username: "openai",
        displayName: "OpenAI"
      });
    });

    it("creates a notification task for each enabled channel and enqueues them", async () => {
      repo.findTargetByTypeExternalId.mockResolvedValue(makeTarget());
      repo.findUniqueBySourceExternalId.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeRecord());
      repo.updateTargetLastMessageAt.mockResolvedValue(undefined);
      repo.findEnabledNotificationChannels.mockResolvedValue([
        makeChannel({ id: "ch_1" }),
        makeChannel({ id: "ch_2", type: "WECHAT" })
      ]);
      repo.createNotificationTasks.mockResolvedValue([
        { id: "task_1", channelId: "ch_1" },
        { id: "task_2", channelId: "ch_2" }
      ]);

      await service.create(input);

      expect(repo.createNotificationTasks).toHaveBeenCalledWith("msg_1", [
        "ch_1",
        "ch_2"
      ]);
      expect(queue.enqueueTask).toHaveBeenCalledWith("task_1", "TELEGRAM");
      expect(queue.enqueueTask).toHaveBeenCalledWith("task_2", "WECHAT");
    });

    it("enqueues QQ channel tasks with the QQ type", async () => {
      repo.findTargetByTypeExternalId.mockResolvedValue(makeTarget());
      repo.findUniqueBySourceExternalId.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeRecord());
      repo.updateTargetLastMessageAt.mockResolvedValue(undefined);
      repo.findEnabledNotificationChannels.mockResolvedValue([
        makeChannel({ id: "ch_qq", type: "QQ" })
      ]);
      repo.createNotificationTasks.mockResolvedValue([
        { id: "task_qq", channelId: "ch_qq" }
      ]);

      await service.create(input);

      expect(queue.enqueueTask).toHaveBeenCalledWith("task_qq", "QQ");
    });

    it("does not enqueue when no new tasks are created (duplicates skipped)", async () => {
      repo.findTargetByTypeExternalId.mockResolvedValue(makeTarget());
      repo.findUniqueBySourceExternalId.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeRecord());
      repo.updateTargetLastMessageAt.mockResolvedValue(undefined);
      repo.findEnabledNotificationChannels.mockResolvedValue([
        makeChannel({ id: "ch_1" })
      ]);
      repo.createNotificationTasks.mockResolvedValue([]);

      await service.create(input);

      expect(queue.enqueueTask).not.toHaveBeenCalled();
    });

    it("does not create tasks when no enabled channels", async () => {
      repo.findTargetByTypeExternalId.mockResolvedValue(makeTarget());
      repo.findUniqueBySourceExternalId.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeRecord());
      repo.updateTargetLastMessageAt.mockResolvedValue(undefined);
      repo.findEnabledNotificationChannels.mockResolvedValue([]);

      await service.create(input);

      expect(repo.createNotificationTasks).not.toHaveBeenCalled();
    });

    it("returns existing message without creating on duplicate source+externalId", async () => {
      repo.findTargetByTypeExternalId.mockResolvedValue(makeTarget());
      repo.findUniqueBySourceExternalId.mockResolvedValue(makeRecord());
      repo.findEnabledNotificationChannels.mockResolvedValue([]);

      const result = await service.create(input);

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.updateTargetLastMessageAt).not.toHaveBeenCalled();
      expect(result.id).toBe("msg_1");
    });

    it("throws NotFound when target missing", async () => {
      repo.findTargetByTypeExternalId.mockResolvedValue(null);

      await expect(service.create(input)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("passes filters to repository", async () => {
      repo.findMany.mockResolvedValue([makeRecord()]);
      repo.count.mockResolvedValue(1);

      const result = await service.list({
        page: 1,
        pageSize: 20,
        source: "TELEGRAM",
        targetId: "target_1",
        keyword: "openai",
        dateFrom: new Date("2026-09-01T00:00:00.000Z"),
        dateTo: new Date("2026-09-03T00:00:00.000Z")
      });

      expect(repo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
          where: expect.objectContaining({
            source: "TELEGRAM",
            targetId: "target_1",
            publishedAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date)
            })
          })
        })
      );
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });
  });

  describe("findOne", () => {
    it("returns dto when found", async () => {
      repo.findUnique.mockResolvedValue(makeRecord());
      const result = await service.findOne("msg_1");
      expect(result.data.id).toBe("msg_1");
    });

    it("throws NotFound when missing", async () => {
      repo.findUnique.mockResolvedValue(null);
      await expect(service.findOne("missing")).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe("findNotifications", () => {
    it("throws NotFound when message missing", async () => {
      repo.findUnique.mockResolvedValue(null);
      await expect(service.findNotifications("missing")).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it("returns notifications with channel", async () => {
      repo.findUnique.mockResolvedValue(makeRecord());
      repo.findNotifications.mockResolvedValue([
        {
          id: "task_1",
          channel: { id: "ch_1", name: "Telegram Bot", type: "TELEGRAM" },
          status: "SENT",
          attempts: 1,
          sentAt: new Date("2026-09-02T10:01:00.000Z")
        }
      ]);

      const result = await service.findNotifications("msg_1");

      expect(result.data).toEqual([
        {
          id: "task_1",
          channel: { id: "ch_1", name: "Telegram Bot", type: "TELEGRAM" },
          status: "SENT",
          attempts: 1,
          sentAt: new Date("2026-09-02T10:01:00.000Z")
        }
      ]);
    });
  });
});
