import { Injectable } from "@nestjs/common";
import {
  MessageSource,
  MonitorType,
  NotificationChannel,
  Prisma
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type MessageWithTarget = Prisma.MessageGetPayload<{
  include: { target: true };
}>;

export type NotificationTaskWithChannel = Prisma.NotificationTaskGetPayload<{
  include: { channel: true };
}>;

@Injectable()
export class MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(
    args: Omit<Prisma.MessageFindManyArgs, "include">
  ): Promise<MessageWithTarget[]> {
    return this.prisma.message.findMany({
      ...args,
      include: { target: true }
    });
  }

  count(args: Prisma.MessageCountArgs) {
    return this.prisma.message.count(args);
  }

  findUnique(id: string): Promise<MessageWithTarget | null> {
    return this.prisma.message.findUnique({
      where: { id },
      include: { target: true }
    });
  }

  findUniqueBySourceExternalId(
    source: MessageSource,
    externalId: string
  ): Promise<MessageWithTarget | null> {
    return this.prisma.message.findUnique({
      where: { source_externalId: { source, externalId } },
      include: { target: true }
    });
  }

  findTargetByTypeExternalId(type: MonitorType, externalId: string) {
    return this.prisma.monitorTarget.findUnique({
      where: { type_externalId: { type, externalId } }
    });
  }

  // Resolves an enabled Telegram target by chat id, regardless of whether it
  // was configured as a channel or a group (used by the listener).
  findTelegramTargetByExternalId(externalId: string) {
    return this.prisma.monitorTarget.findFirst({
      where: {
        type: { in: [MonitorType.TG_CHANNEL, MonitorType.TG_GROUP] },
        externalId,
        enabled: true
      }
    });
  }

  create(data: Prisma.MessageUncheckedCreateInput): Promise<MessageWithTarget> {
    return this.prisma.message.create({
      data,
      include: { target: true }
    });
  }

  updateTargetLastMessageAt(targetId: string, publishedAt: Date) {
    return this.prisma.monitorTarget.update({
      where: { id: targetId },
      data: { lastMessageAt: publishedAt }
    });
  }

  findNotifications(messageId: string): Promise<NotificationTaskWithChannel[]> {
    return this.prisma.notificationTask.findMany({
      where: { messageId },
      include: { channel: true },
      orderBy: { createdAt: "asc" }
    });
  }

  findEnabledNotificationChannels(): Promise<NotificationChannel[]> {
    return this.prisma.notificationChannel.findMany({
      where: { enabled: true }
    });
  }

  createNotificationTasks(
    messageId: string,
    channelIds: string[]
  ): Promise<Array<{ id: string; channelId: string }>> {
    // createManyAndReturn returns only the records actually created, so skipped
    // duplicates are excluded. The caller enqueues each new task onto the queue.
    return this.prisma.notificationTask.createManyAndReturn({
      data: channelIds.map((channelId) => ({ messageId, channelId })),
      skipDuplicates: true,
      select: { id: true, channelId: true }
    });
  }
}
