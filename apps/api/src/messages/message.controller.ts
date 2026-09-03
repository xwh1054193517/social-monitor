import { Controller, Get, Param, Query } from "@nestjs/common";
import { MessageQueryDto } from "./dto/message-query.dto";
import { MessageService } from "./message.service";

@Controller("messages")
export class MessageController {
  constructor(private readonly service: MessageService) {}

  @Get()
  list(@Query() query: MessageQueryDto) {
    return this.service.list(query);
  }

  @Get(":id/notifications")
  findNotifications(@Param("id") id: string) {
    return this.service.findNotifications(id);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }
}
