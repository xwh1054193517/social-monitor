import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import { CreateMonitorDto } from "./dto/create-monitor.dto";
import { MonitorQueryDto } from "./dto/monitor-query.dto";
import { UpdateMonitorDto } from "./dto/update-monitor.dto";
import { MonitorService } from "./monitor.service";

@Controller("monitors")
export class MonitorController {
  constructor(private readonly service: MonitorService) {}

  @Get()
  list(@Query() query: MonitorQueryDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateMonitorDto) {
    return this.service.create(dto);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateMonitorDto) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }

  @Post(":id/enable")
  enable(@Param("id") id: string) {
    return this.service.setEnabled(id, true);
  }

  @Post(":id/disable")
  disable(@Param("id") id: string) {
    return this.service.setEnabled(id, false);
  }

  @Post(":id/check")
  check(@Param("id") id: string) {
    return this.service.check(id);
  }
}
