import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import {
  MonitorType,
  NotificationChannel,
  NotificationChannelType,
  NotificationStatus,
  Prisma
} from "@prisma/client";
import { apiData, apiPaginated } from "@social-monitor/shared";
import { SseService } from "../events/sse.service";
import { ChannelQueryDto } from "./dto/channel-query.dto";
import { CreateChannelDto } from "./dto/create-channel.dto";
import { TaskQueryDto } from "./dto/task-query.dto";
import { UpdateChannelDto } from "./dto/update-channel.dto";
import { NotificationProviderFactory } from "./notification-provider.factory";
import { NotificationPayload } from "./notification-provider.interface";
import {
  NotificationRepository,
  NotificationTaskWithRelations
} from "./notification.repository";

/** 监控类型 -> 通知里的「监控渠道」标签 */
const MONITOR_TYPE_LABELS: Record<MonitorType, string> = {
  [MonitorType.X_USER]: "X",
  [MonitorType.TG_CHANNEL]: "TG频道",
  [MonitorType.TG_GROUP]: "TG群组"
};

export interface ChannelDto {
  id: string;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: { configured: boolean };
}

export interface TaskDto {
  id: string;
  messageId: string;
  message: { id: string; targetName: string; content: string };
  channel: { id: string; name: string; type: NotificationChannelType };
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly repository: NotificationRepository,
    private readonly factory: NotificationProviderFactory,
    private readonly events: SseService
  ) {}

  async listChannels(query: ChannelQueryDto) {
    const where: Prisma.NotificationChannelWhereInput = {};
    if (query.type) {
      where.type = query.type;
    }
    if (query.enabled !== undefined) {
      where.enabled = query.enabled;
    }

    const channels = await this.repository.findChannels({
      where,
      orderBy: { createdAt: "desc" }
    });

    return apiData(channels.map((channel) => this.toChannelDto(channel)));
  }

  async createChannel(dto: CreateChannelDto) {
    this.validateConfig(dto.type, dto.config);

    // TODO(Phase 8): encrypt dto.config via EncryptionService (AES-256-GCM)
    // before persisting. Sensitive values (botToken/webhookUrl) must never be
    // stored in plaintext in production.
    const created = await this.repository.createChannel({
      name: dto.name.trim(),
      type: dto.type,
      config: dto.config as Prisma.InputJsonValue
    });

    return apiData(this.toChannelDto(created));
  }

  async getChannel(id: string) {
    const channel = await this.repository.findChannelById(id);
    if (!channel) {
      throw this.channelNotFound(id);
    }
    return apiData(this.toChannelDto(channel));
  }

  async updateChannel(id: string, dto: UpdateChannelDto) {
    const current = await this.ensureChannelExists(id);

    if (dto.config) {
      this.validateConfig(current.type, dto.config);
    }

    const updated = await this.repository.updateChannel(id, {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      ...(dto.config !== undefined && {
        config: dto.config as Prisma.InputJsonValue
      })
    });

    return apiData(this.toChannelDto(updated));
  }

  async removeChannel(id: string) {
    await this.ensureChannelExists(id);
    await this.repository.deleteChannel(id);
    return apiData(true);
  }

  async testChannel(id: string) {
    const channel = await this.repository.findChannelById(id);
    if (!channel) {
      throw this.channelNotFound(id);
    }

    const provider = this.factory.get(channel.type);
    await provider.send(channel.config, {
      sourceLabel: "TG群组",
      targetName: "Social Monitor",
      author: "测试用户",
      content: "Social Monitor 测试消息",
      url: null
    });

    return apiData({ success: true });
  }

  async listTasks(query: TaskQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.NotificationTaskWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.channelId) {
      where.channelId = query.channelId;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = query.dateFrom;
      }
      if (query.dateTo) {
        where.createdAt.lte = query.dateTo;
      }
    }

    const [items, total] = await Promise.all([
      this.repository.findTasks({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.repository.countTasks({ where })
    ]);

    return apiPaginated(items.map((task) => this.toTaskDto(task)), {
      page,
      pageSize,
      total
    });
  }

  async getTask(id: string) {
    const task = await this.repository.findTaskWithRelations(id);
    if (!task) {
      throw this.taskNotFound(id);
    }
    return apiData(this.toTaskDetailDto(task));
  }

  // Synchronous task runner kept for manual/back-compat invocation. It runs a
  // single attempt and swallows the provider error (status FAILED is already
  // persisted). The BullMQ worker path uses processTask() instead.
  async dispatch(taskId: string): Promise<void> {
    try {
      await this.processTask(taskId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      // Provider error: status FAILED has already been persisted by processTask().
    }
  }

  // Processes one notification attempt. Called by the BullMQ worker for every
  // retry. On failure it persists FAILED (with lastError) and rethrows so
  // BullMQ schedules the next attempt (attempts = 5, exponential backoff).
  async processTask(taskId: string): Promise<void> {
    const task = await this.repository.findTaskWithRelations(taskId);
    if (!task) {
      throw this.taskNotFound(taskId);
    }

    await this.repository.updateTask(taskId, {
      status: NotificationStatus.PROCESSING,
      attempts: { increment: 1 }
    });

    try {
      const provider = this.factory.get(task.channel.type);
      await provider.send(task.channel.config, this.buildPayload(task));
      await this.repository.updateTask(taskId, {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        lastError: null
      });
      this.logger.log(
        `notification.sent taskId=${taskId} channel=${task.channel.type}`
      );
      this.events.emit("notification.sent", {
        id: taskId,
        channelType: task.channel.type,
        attempts: task.attempts + 1
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.updateTask(taskId, {
        status: NotificationStatus.FAILED,
        lastError: message
      });
      this.logger.warn(
        `notification.failed taskId=${taskId} channel=${task.channel.type}: ${message}`
      );
      this.logger.log(`notification.retry taskId=${taskId}`);
      this.events.emit("notification.failed", {
        id: taskId,
        channelType: task.channel.type,
        attempts: task.attempts + 1,
        error: message
      });
      throw error;
    }
  }

  private buildPayload(task: NotificationTaskWithRelations): NotificationPayload {
    const message = task.message;
    const target = message.target;
    // 发言人只有 TG 群组才有（频道/X 的作者就是监控对象本身，冗余）
    const author =
      target.type === MonitorType.TG_GROUP
        ? message.authorName ||
          message.authorUsername ||
          message.authorExternalId ||
          ""
        : "";
    return {
      sourceLabel: MONITOR_TYPE_LABELS[target.type] ?? target.type,
      targetName: target.name,
      author,
      content: message.content,
      url: message.url
    };
  }

  private validateConfig(
    type: NotificationChannelType,
    config: Record<string, unknown>
  ): void {
    if (type === NotificationChannelType.TELEGRAM) {
      if (!config.botToken || !config.chatId) {
        throw new BadRequestException({
          statusCode: 400,
          message: "TELEGRAM channel requires config.botToken and config.chatId",
          code: "INVALID_CHANNEL"
        });
      }
      return;
    }

    if (type === NotificationChannelType.WECHAT) {
      if (!config.webhookUrl) {
        throw new BadRequestException({
          statusCode: 400,
          message: "WECHAT channel requires config.webhookUrl",
          code: "INVALID_CHANNEL"
        });
      }
      return;
    }

    if (type === NotificationChannelType.QQ) {
      if (!config.groupOpenid) {
        throw new BadRequestException({
          statusCode: 400,
          message: "QQ channel requires config.groupOpenid",
          code: "INVALID_CHANNEL"
        });
      }
    }
  }

  private toChannelDto(channel: NotificationChannel): ChannelDto {
    return {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      enabled: channel.enabled,
      // Sensitive config (botToken/webhookUrl) is never returned to clients.
      config: { configured: true }
    };
  }

  private toTaskDto(task: NotificationTaskWithRelations): TaskDto {
    return {
      id: task.id,
      messageId: task.messageId,
      message: {
        id: task.message.id,
        targetName: task.message.target.name,
        content: task.message.content.slice(0, 120)
      },
      channel: {
        id: task.channel.id,
        name: task.channel.name,
        type: task.channel.type
      },
      status: task.status,
      attempts: task.attempts,
      lastError: task.lastError,
      sentAt: task.sentAt,
      createdAt: task.createdAt
    };
  }

  private toTaskDetailDto(task: NotificationTaskWithRelations) {
    return {
      ...this.toTaskDto(task),
      message: {
        id: task.message.id,
        source: task.message.source,
        targetName: task.message.target.name,
        content: task.message.content,
        url: task.message.url,
        publishedAt: task.message.publishedAt
      }
    };
  }

  private async ensureChannelExists(id: string): Promise<NotificationChannel> {
    const channel = await this.repository.findChannelById(id);
    if (!channel) {
      throw this.channelNotFound(id);
    }
    return channel;
  }

  private channelNotFound(id: string) {
    return new NotFoundException({
      statusCode: 404,
      message: `Notification channel not found: ${id}`,
      code: "CHANNEL_NOT_FOUND"
    });
  }

  private taskNotFound(id: string) {
    return new NotFoundException({
      statusCode: 404,
      message: `Notification task not found: ${id}`,
      code: "TASK_NOT_FOUND"
    });
  }
}
