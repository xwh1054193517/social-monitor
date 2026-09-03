import { Injectable } from "@nestjs/common";
import { apiData } from "@social-monitor/shared";
import { DashboardRepository } from "./dashboard.repository";

export interface DashboardOverviewDto {
  todayMessages: number;
  xMessages: number;
  telegramMessages: number;
  monitors: number;
  notificationSent: number;
  notificationFailed: number;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async overview() {
    const start = startOfToday();

    const [
      todayMessages,
      xMessages,
      telegramMessages,
      monitors,
      notificationSent,
      notificationFailed
    ] = await Promise.all([
      this.repository.countMessages({ publishedAt: { gte: start } }),
      this.repository.countMessages({
        source: "X",
        publishedAt: { gte: start }
      }),
      this.repository.countMessages({
        source: "TELEGRAM",
        publishedAt: { gte: start }
      }),
      this.repository.countMonitors({ enabled: true }),
      this.repository.countTasks({ status: "SENT", sentAt: { gte: start } }),
      this.repository.countTasks({
        status: "FAILED",
        createdAt: { gte: start }
      })
    ]);

    const overview: DashboardOverviewDto = {
      todayMessages,
      xMessages,
      telegramMessages,
      monitors,
      notificationSent,
      notificationFailed
    };

    return apiData(overview);
  }
}
