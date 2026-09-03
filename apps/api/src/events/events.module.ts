import { Global, Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { SseService } from "./sse.service";

@Global()
@Module({
  controllers: [EventsController],
  providers: [SseService],
  exports: [SseService]
})
export class EventsModule {}
