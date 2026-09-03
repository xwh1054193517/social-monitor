import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { MessageModule } from "./messages/message.module";
import { MonitorModule } from "./monitors/monitor.module";
import { NotificationModule } from "./notifications/notification.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QqModule } from "./qq/qq.module";
import { QueueModule } from "./queue/queue.module";
import { TelegramModule } from "./telegram/telegram.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env", ".env"]
    }),
    PrismaModule,
    AuthModule,
    EventsModule,
    HealthModule,
    DashboardModule,
    MonitorModule,
    MessageModule,
    NotificationModule,
    QueueModule,
    QqModule,
    TelegramModule
  ]
})
export class AppModule {}
