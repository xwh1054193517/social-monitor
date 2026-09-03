import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ConnectionOptions, Job, Worker } from "bullmq";
import { NotificationService } from "../notifications/notification.service";
import {
  NOTIFICATION_QQ_QUEUE,
  NOTIFICATION_TELEGRAM_QUEUE,
  NOTIFICATION_WECHAT_QUEUE
} from "./notification-queue.service";

interface NotificationJobData {
  taskId: string;
}

/**
 * In-process BullMQ workers. Each queue has a dedicated worker that loads the
 * NotificationTask (together with its Message and Channel), sends through the
 * matching Provider and updates the task status.
 *
 * Retries (attempts = 5, exponential backoff) are configured at enqueue time;
 * the worker only needs to rethrow on failure so BullMQ schedules the retry.
 */
@Injectable()
export class NotificationWorkerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationWorkerService.name);
  private readonly workers: Worker[] = [];
  private readonly connection: ConnectionOptions;

  constructor(
    config: ConfigService,
    private readonly notifications: NotificationService
  ) {
    this.connection = {
      host: config.get<string>("REDIS_HOST", "localhost"),
      port: Number(config.get<string>("REDIS_PORT", "6379"))
    };
    const password = config.get<string>("REDIS_PASSWORD", "");
    if (password) {
      (this.connection as Record<string, unknown>).password = password;
    }
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") {
      this.logger.log("Notification workers disabled in test environment");
      return;
    }

    for (const name of [
      NOTIFICATION_TELEGRAM_QUEUE,
      NOTIFICATION_WECHAT_QUEUE,
      NOTIFICATION_QQ_QUEUE
    ]) {
      const worker = new Worker<NotificationJobData>(
        name,
        async (job) => this.process(job),
        { connection: this.connection, concurrency: 5 }
      );

      worker.on("completed", (job) => {
        this.logger.log(`Notification job ${job.id} completed`);
      });
      worker.on("failed", (job, error) => {
        this.logger.error(
          `Notification job ${job?.id} failed: ${error.message}`
        );
      });

      this.workers.push(worker);
    }
  }

  private async process(job: Job<NotificationJobData>): Promise<void> {
    await this.notifications.processTask(job.data.taskId);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
