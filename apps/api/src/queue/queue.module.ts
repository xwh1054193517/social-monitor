import { Global, Module } from "@nestjs/common";
import { NotificationModule } from "../notifications/notification.module";
import { NotificationQueueService } from "./notification-queue.service";
import { NotificationWorkerService } from "./notification-worker.service";

@Global()
@Module({
  imports: [NotificationModule],
  providers: [NotificationQueueService, NotificationWorkerService],
  exports: [NotificationQueueService]
})
export class QueueModule {}
