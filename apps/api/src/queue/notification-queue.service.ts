import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NotificationChannelType } from "@prisma/client";
import { ConnectionOptions, Queue } from "bullmq";

export const NOTIFICATION_TELEGRAM_QUEUE = "notification-telegram";
export const NOTIFICATION_WECHAT_QUEUE = "notification-wechat";
export const NOTIFICATION_QQ_QUEUE = "notification-qq";

export const NOTIFICATION_QUEUE_JOB = "send-notification";

/**
 * Routes NotificationTask records onto the per-channel BullMQ queues.
 *
 * A task is enqueued once, immediately after it is persisted with status
 * PENDING. The queue name is derived from the channel type so each platform
 * can be operated/scaled independently (Phase 7).
 */
@Injectable()
export class NotificationQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private readonly queues = new Map<string, Queue>();
  private readonly connection: ConnectionOptions;

  constructor(config: ConfigService) {
    this.connection = {
      host: config.get<string>("REDIS_HOST", "localhost"),
      port: Number(config.get<string>("REDIS_PORT", "6379"))
    };
    const password = config.get<string>("REDIS_PASSWORD", "");
    if (password) {
      (this.connection as Record<string, unknown>).password = password;
    }
  }

  enqueueTask(taskId: string, type: NotificationChannelType): Promise<unknown> {
    const queue = this.queueFor(type);
    this.logger.log(
      `Enqueueing notification task ${taskId} -> ${queue.name}`
    );
    return queue.add(
      NOTIFICATION_QUEUE_JOB,
      { taskId },
      {
        // Phase 7: retry up to 5 attempts with exponential backoff.
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 }
      }
    );
  }

  private queueFor(type: NotificationChannelType): Queue {
    const name = this.queueName(type);
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);
    }
    return queue;
  }

  private queueName(type: NotificationChannelType): string {
    switch (type) {
      case NotificationChannelType.TELEGRAM:
        return NOTIFICATION_TELEGRAM_QUEUE;
      case NotificationChannelType.WECHAT:
        return NOTIFICATION_WECHAT_QUEUE;
      case NotificationChannelType.QQ:
        return NOTIFICATION_QQ_QUEUE;
      default:
        throw new BadRequestException({
          statusCode: 400,
          message: `Unsupported notification channel type: ${type}`,
          code: "UNSUPPORTED_CHANNEL_TYPE"
        });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }
}
