import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type NotificationTaskWithRelations = Prisma.NotificationTaskGetPayload<{
  include: { message: { include: { target: true } }; channel: true };
}>;

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findChannels(args: Prisma.NotificationChannelFindManyArgs) {
    return this.prisma.notificationChannel.findMany(args);
  }

  findChannelById(id: string) {
    return this.prisma.notificationChannel.findUnique({ where: { id } });
  }

  createChannel(data: Prisma.NotificationChannelCreateInput) {
    return this.prisma.notificationChannel.create({ data });
  }

  updateChannel(id: string, data: Prisma.NotificationChannelUpdateInput) {
    return this.prisma.notificationChannel.update({ where: { id }, data });
  }

  deleteChannel(id: string) {
    return this.prisma.notificationChannel.delete({ where: { id } });
  }

  findTasks(
    args: Omit<Prisma.NotificationTaskFindManyArgs, "include">
  ): Promise<NotificationTaskWithRelations[]> {
    return this.prisma.notificationTask.findMany({
      ...args,
      include: { message: { include: { target: true } }, channel: true }
    });
  }

  countTasks(args: Prisma.NotificationTaskCountArgs) {
    return this.prisma.notificationTask.count(args);
  }

  findTaskWithRelations(
    id: string
  ): Promise<NotificationTaskWithRelations | null> {
    return this.prisma.notificationTask.findUnique({
      where: { id },
      include: { message: { include: { target: true } }, channel: true }
    });
  }

  updateTask(id: string, data: Prisma.NotificationTaskUpdateInput) {
    return this.prisma.notificationTask.update({ where: { id }, data });
  }
}
