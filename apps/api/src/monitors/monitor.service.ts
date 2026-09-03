import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { MonitorType, Prisma } from "@prisma/client";
import { apiData, apiPaginated } from "@social-monitor/shared";
import { SseService } from "../events/sse.service";
import { CreateMonitorDto } from "./dto/create-monitor.dto";
import { MonitorQueryDto } from "./dto/monitor-query.dto";
import { UpdateMonitorDto } from "./dto/update-monitor.dto";
import { MonitorRepository } from "./monitor.repository";

export interface MonitorDto {
  id: string;
  type: MonitorType;
  name: string;
  username: string | null;
  externalId: string;
  enabled: boolean;
  lastMessageAt: Date | null;
}

type MonitorRecord = {
  id: string;
  type: MonitorType;
  name: string;
  username: string | null;
  externalId: string;
  enabled: boolean;
  lastMessageAt: Date | null;
};

@Injectable()
export class MonitorService {
  constructor(
    private readonly repository: MonitorRepository,
    private readonly events: SseService
  ) {}

  async list(query: MonitorQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.MonitorTargetWhereInput = {};
    if (query.type) {
      where.type = query.type;
    }
    if (query.enabled !== undefined) {
      where.enabled = query.enabled;
    }
    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword, mode: "insensitive" } },
        { username: { contains: query.keyword, mode: "insensitive" } },
        { externalId: { contains: query.keyword, mode: "insensitive" } }
      ];
    }

    const [items, total] = await Promise.all([
      this.repository.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.repository.count({ where })
    ]);

    return apiPaginated(items.map((item) => this.toDto(item)), {
      page,
      pageSize,
      total
    });
  }

  async create(dto: CreateMonitorDto) {
    const normalized = this.normalizeCreate(dto);

    const existing = await this.repository.findUniqueByTypeExternalId(
      normalized.type,
      normalized.externalId
    );
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: "Monitor target already exists",
        code: "MONITOR_EXISTS"
      });
    }

    const created = await this.repository.create({
      type: normalized.type,
      name: normalized.name,
      username: normalized.username,
      externalId: normalized.externalId
    });

    return apiData(this.toDto(created));
  }

  async findOne(id: string) {
    const monitor = await this.repository.findUnique(id);
    if (!monitor) {
      throw this.notFound(id);
    }
    return apiData(this.toDto(monitor));
  }

  async update(id: string, dto: UpdateMonitorDto) {
    await this.ensureExists(id);
    const updated = await this.repository.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.username !== undefined && { username: dto.username }),
      ...(dto.externalId !== undefined && { externalId: dto.externalId }),
      ...(dto.enabled !== undefined && { enabled: dto.enabled })
    });
    return apiData(this.toDto(updated));
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.repository.delete(id);
    return apiData(true);
  }

  async setEnabled(id: string, enabled: boolean) {
    await this.ensureExists(id);
    const updated = await this.repository.update(id, { enabled });
    this.events.emit("monitor.status_changed", {
      id,
      enabled,
      type: updated.type
    });
    return apiData(this.toDto(updated));
  }

  async check(id: string) {
    const monitor = await this.repository.findUnique(id);
    if (!monitor) {
      throw this.notFound(id);
    }
    return apiData({
      valid: this.hasRequiredParams(monitor),
      name: monitor.name
    });
  }

  private normalizeCreate(dto: CreateMonitorDto) {
    const name = dto.name.trim();
    const username = dto.username?.trim() || null;
    let externalId = dto.externalId?.trim();

    if (dto.type === "X_USER") {
      if (!username && !externalId) {
        throw new BadRequestException({
          statusCode: 400,
          message: "X_USER requires username or externalId",
          code: "INVALID_MONITOR"
        });
      }
      if (!externalId) {
        externalId = username ?? undefined;
      }
    } else if (!externalId) {
      throw new BadRequestException({
        statusCode: 400,
        message: `${dto.type} requires externalId (chat id)`,
        code: "INVALID_MONITOR"
      });
    }

    return {
      type: dto.type,
      name,
      username,
      externalId: externalId as string
    };
  }

  private hasRequiredParams(monitor: MonitorRecord): boolean {
    if (monitor.type === "X_USER") {
      return Boolean(monitor.username || monitor.externalId);
    }
    return Boolean(monitor.externalId);
  }

  private toDto(monitor: MonitorRecord): MonitorDto {
    return {
      id: monitor.id,
      type: monitor.type,
      name: monitor.name,
      username: monitor.username,
      externalId: monitor.externalId,
      enabled: monitor.enabled,
      lastMessageAt: monitor.lastMessageAt
    };
  }

  private async ensureExists(id: string): Promise<MonitorRecord> {
    const monitor = await this.repository.findUnique(id);
    if (!monitor) {
      throw this.notFound(id);
    }
    return monitor;
  }

  private notFound(id: string) {
    return new NotFoundException({
      statusCode: 404,
      message: `Monitor target not found: ${id}`,
      code: "MONITOR_NOT_FOUND"
    });
  }
}
