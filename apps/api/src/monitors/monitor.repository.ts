import { Injectable } from "@nestjs/common";
import { MonitorType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MonitorRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(args: Prisma.MonitorTargetFindManyArgs) {
    return this.prisma.monitorTarget.findMany(args);
  }

  count(args: Prisma.MonitorTargetCountArgs) {
    return this.prisma.monitorTarget.count(args);
  }

  findUnique(id: string) {
    return this.prisma.monitorTarget.findUnique({ where: { id } });
  }

  findUniqueByTypeExternalId(type: MonitorType, externalId: string) {
    return this.prisma.monitorTarget.findUnique({
      where: { type_externalId: { type, externalId } }
    });
  }

  create(data: Prisma.MonitorTargetCreateInput) {
    return this.prisma.monitorTarget.create({ data });
  }

  update(id: string, data: Prisma.MonitorTargetUpdateInput) {
    return this.prisma.monitorTarget.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.monitorTarget.delete({ where: { id } });
  }
}
