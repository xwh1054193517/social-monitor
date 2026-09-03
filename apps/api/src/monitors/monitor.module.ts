import { Module } from "@nestjs/common";
import { MonitorController } from "./monitor.controller";
import { MonitorRepository } from "./monitor.repository";
import { MonitorService } from "./monitor.service";

@Module({
  controllers: [MonitorController],
  providers: [MonitorService, MonitorRepository]
})
export class MonitorModule {}
