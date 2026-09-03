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
import { ChannelQueryDto } from "./dto/channel-query.dto";
import { CreateChannelDto } from "./dto/create-channel.dto";
import { TaskQueryDto } from "./dto/task-query.dto";
import { UpdateChannelDto } from "./dto/update-channel.dto";
import { NotificationService } from "./notification.service";

@Controller("notifications")
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get("channels")
  listChannels(@Query() query: ChannelQueryDto) {
    return this.service.listChannels(query);
  }

  @Post("channels")
  createChannel(@Body() dto: CreateChannelDto) {
    return this.service.createChannel(dto);
  }

  @Get("channels/:id")
  getChannel(@Param("id") id: string) {
    return this.service.getChannel(id);
  }

  @Patch("channels/:id")
  updateChannel(@Param("id") id: string, @Body() dto: UpdateChannelDto) {
    return this.service.updateChannel(id, dto);
  }

  @Delete("channels/:id")
  removeChannel(@Param("id") id: string) {
    return this.service.removeChannel(id);
  }

  @Post("channels/:id/test")
  testChannel(@Param("id") id: string) {
    return this.service.testChannel(id);
  }

  @Get("tasks")
  listTasks(@Query() query: TaskQueryDto) {
    return this.service.listTasks(query);
  }

  @Get("tasks/:id")
  getTask(@Param("id") id: string) {
    return this.service.getTask(id);
  }
}
