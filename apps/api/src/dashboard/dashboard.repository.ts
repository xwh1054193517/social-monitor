import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  countMessages(where: Prisma.MessageWhereInput) {
    return this.prisma.message.count({ where });
  }

  countMonitors(where: Prisma.MonitorTargetWhereInput) {
    return this.prisma.monitorTarget.count({ where });
  }

  countTasks(where: Prisma.NotificationTaskWhereInput) {
    return this.prisma.notificationTask.count({ where });
  }
}
