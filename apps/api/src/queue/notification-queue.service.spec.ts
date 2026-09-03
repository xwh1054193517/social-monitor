import { ConfigService } from "@nestjs/config";
import { NotificationChannelType } from "@prisma/client";
import { Queue } from "bullmq";
import {
  NotificationQueueService,
  NOTIFICATION_QUEUE_JOB,
  NOTIFICATION_TELEGRAM_QUEUE,
  NOTIFICATION_WECHAT_QUEUE,
  NOTIFICATION_QQ_QUEUE
} from "./notification-queue.service";

jest.mock("bullmq", () => ({
  Queue: jest.fn()
}));

const QueueMock = Queue as unknown as jest.Mock;

describe("NotificationQueueService", () => {
  const add = jest.fn().mockResolvedValue({ id: "job_1" });
  const close = jest.fn().mockResolvedValue(undefined);

  const makeConfig = () =>
    ({
      get: jest.fn((key: string, def?: unknown) => {
        if (key === "REDIS_HOST") {
          return "localhost";
        }
        if (key === "REDIS_PORT") {
          return "6379";
        }
        if (key === "REDIS_PASSWORD") {
          return "";
        }
        return def;
      })
    }) as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    QueueMock.mockImplementation((name: string) => ({
      name,
      add,
      close
    }));
  });

  it("enqueues a TELEGRAM task with 5 attempts and exponential backoff", async () => {
    const service = new NotificationQueueService(makeConfig());

    await service.enqueueTask("task_1", NotificationChannelType.TELEGRAM);

    expect(QueueMock).toHaveBeenCalledWith(NOTIFICATION_TELEGRAM_QUEUE, {
      connection: { host: "localhost", port: 6379 }
    });
    expect(add).toHaveBeenCalledWith(
      NOTIFICATION_QUEUE_JOB,
      { taskId: "task_1" },
      { attempts: 5, backoff: { type: "exponential", delay: 1000 } }
    );
  });

  it("enqueues a WECHAT task onto the wechat queue", async () => {
    const service = new NotificationQueueService(makeConfig());

    await service.enqueueTask("task_2", NotificationChannelType.WECHAT);

    expect(QueueMock).toHaveBeenCalledWith(NOTIFICATION_WECHAT_QUEUE, {
      connection: { host: "localhost", port: 6379 }
    });
    expect(add).toHaveBeenCalledWith(
      NOTIFICATION_QUEUE_JOB,
      { taskId: "task_2" },
      { attempts: 5, backoff: { type: "exponential", delay: 1000 } }
    );
  });

  it("enqueues a QQ task onto the qq queue", async () => {
    const service = new NotificationQueueService(makeConfig());

    await service.enqueueTask("task_3", NotificationChannelType.QQ);

    expect(QueueMock).toHaveBeenCalledWith(NOTIFICATION_QQ_QUEUE, {
      connection: { host: "localhost", port: 6379 }
    });
    expect(add).toHaveBeenCalledWith(
      NOTIFICATION_QUEUE_JOB,
      { taskId: "task_3" },
      { attempts: 5, backoff: { type: "exponential", delay: 1000 } }
    );
  });

  it("reuses a single Queue instance per channel type", async () => {
    const service = new NotificationQueueService(makeConfig());

    await service.enqueueTask("task_1", NotificationChannelType.TELEGRAM);
    await service.enqueueTask("task_2", NotificationChannelType.TELEGRAM);

    expect(QueueMock).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(2);
  });

  it("closes all queues on module destroy", async () => {
    const service = new NotificationQueueService(makeConfig());

    await service.enqueueTask("task_1", NotificationChannelType.TELEGRAM);
    await service.onModuleDestroy();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
