import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { MessageSource, MonitorType, Prisma } from "@prisma/client";
import { apiData, apiPaginated } from "@social-monitor/shared";
import type { NormalizedMessage } from "@social-monitor/types";
import { isPrismaUniqueViolation } from "../common/prisma.util";
import { SseService } from "../events/sse.service";
import { NotificationQueueService } from "../queue/notification-queue.service";
import { MessageQueryDto } from "./dto/message-query.dto";
import {
  MessageRepository,
  MessageWithTarget,
  NotificationTaskWithChannel
} from "./message.repository";

export interface MessageAuthorDto {
  externalId?: string;
  username?: string;
  displayName?: string;
}

export interface MessageDto {
  id: string;
  source: MessageSource;
  target: { id: string; name: string };
  author: MessageAuthorDto | null;
  content: string;
  url: string | null;
  publishedAt: Date;
}

export interface MessageNotificationDto {
  id: string;
  channel: {
    id: string;
    name: string;
    type: string;
  };
  status: string;
  attempts: number;
  sentAt: Date | null;
}

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    private readonly repository: MessageRepository,
    private readonly queue: NotificationQueueService,
    private readonly events: SseService
  ) {}

  async create(input: NormalizedMessage): Promise<MessageDto> {
    const target = await this.resolveTarget(input);

    const existing = await this.repository.findUniqueBySourceExternalId(
      input.source as MessageSource,
      input.externalId
    );

    let message: MessageWithTarget;
    let isNew = false;

    if (existing) {
      message = existing;
    } else {
      const data: Prisma.MessageUncheckedCreateInput = {
        source: input.source as MessageSource,
        externalId: input.externalId,
        targetId: target.id,
        authorExternalId: input.author?.externalId ?? null,
        authorUsername: input.author?.username ?? null,
        authorName: input.author?.displayName ?? null,
        content: input.content,
        url: input.url ?? null,
        publishedAt: input.publishedAt
      };

      try {
        message = await this.repository.create(data);
        isNew = true;
      } catch (error) {
        if (!isPrismaUniqueViolation(error)) {
          throw error;
        }
        const deduped = await this.repository.findUniqueBySourceExternalId(
          input.source as MessageSource,
          input.externalId
        );
        if (!deduped) {
          throw error;
        }
        message = deduped;
      }
    }

    if (isNew) {
      await this.repository.updateTargetLastMessageAt(
        target.id,
        input.publishedAt
      );
      this.logger.log(
        `message.saved id=${message.id} source=${message.source} target=${message.target.name}`
      );
      this.events.emit("message.created", {
        id: message.id,
        source: message.source,
        targetName: message.target.name
      });
    } else {
      this.logger.log(
        `message.duplicate source=${message.source} externalId=${message.externalId}`
      );
    }

    await this.routeToEnabledChannels(message.id);

    return this.toDto(message);
  }

  async list(query: MessageQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.MessageWhereInput = {};
    if (query.source) {
      where.source = query.source;
    }
    if (query.targetId) {
      where.targetId = query.targetId;
    }
    if (query.keyword) {
      where.OR = [
        { content: { contains: query.keyword, mode: "insensitive" } },
        { authorUsername: { contains: query.keyword, mode: "insensitive" } },
        { authorName: { contains: query.keyword, mode: "insensitive" } },
        { authorExternalId: { contains: query.keyword, mode: "insensitive" } }
      ];
    }
    if (query.dateFrom || query.dateTo) {
      where.publishedAt = {};
      if (query.dateFrom) {
        where.publishedAt.gte = query.dateFrom;
      }
      if (query.dateTo) {
        where.publishedAt.lte = query.dateTo;
      }
    }

    const [items, total] = await Promise.all([
      this.repository.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.repository.count({ where })
    ]);

    return apiPaginated(
      items.map((item) => this.toDto(item)),
      { page, pageSize, total }
    );
  }

  async findOne(id: string) {
    const message = await this.repository.findUnique(id);
    if (!message) {
      throw this.notFound(id);
    }
    return apiData(this.toDto(message));
  }

  async findNotifications(id: string) {
    const message = await this.repository.findUnique(id);
    if (!message) {
      throw this.notFound(id);
    }
    const tasks = await this.repository.findNotifications(id);
    return apiData(tasks.map((task) => this.toNotificationDto(task)));
  }

  private async routeToEnabledChannels(messageId: string): Promise<void> {
    const channels = await this.repository.findEnabledNotificationChannels();
    if (channels.length === 0) {
      return;
    }

    const typeByChannelId = new Map(
      channels.map((channel) => [channel.id, channel.type])
    );

    const created = await this.repository.createNotificationTasks(
      messageId,
      channels.map((channel) => channel.id)
    );

    this.logger.log(
      `notification.created count=${created.length} messageId=${messageId}`
    );

    // Phase 7: newly created tasks are enqueued onto the per-channel BullMQ
    // queue. Duplicates skipped by the repository are intentionally not queued.
    for (const task of created) {
      const type = typeByChannelId.get(task.channelId);
      if (type) {
        await this.queue.enqueueTask(task.id, type);
      }
    }
  }

  private async resolveTarget(input: NormalizedMessage) {
    const target = await this.repository.findTargetByTypeExternalId(
      input.targetType as MonitorType,
      input.targetExternalId
    );
    if (!target) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Monitor target not found: ${input.targetType}:${input.targetExternalId}`,
        code: "TARGET_NOT_FOUND"
      });
    }
    return target;
  }

  private toDto(message: MessageWithTarget): MessageDto {
    const hasAuthor =
      message.authorExternalId != null ||
      message.authorUsername != null ||
      message.authorName != null;

    return {
      id: message.id,
      source: message.source,
      target: { id: message.target.id, name: message.target.name },
      author: hasAuthor
        ? {
            ...(message.authorExternalId != null && {
              externalId: message.authorExternalId
            }),
            ...(message.authorUsername != null && {
              username: message.authorUsername
            }),
            ...(message.authorName != null && { displayName: message.authorName })
          }
        : null,
      content: message.content,
      url: message.url,
      publishedAt: message.publishedAt
    };
  }

  private toNotificationDto(
    task: NotificationTaskWithChannel
  ): MessageNotificationDto {
    return {
      id: task.id,
      channel: {
        id: task.channel.id,
        name: task.channel.name,
        type: task.channel.type
      },
      status: task.status,
      attempts: task.attempts,
      sentAt: task.sentAt
    };
  }

  private notFound(id: string) {
    return new NotFoundException({
      statusCode: 404,
      message: `Message not found: ${id}`,
      code: "MESSAGE_NOT_FOUND"
    });
  }
}
