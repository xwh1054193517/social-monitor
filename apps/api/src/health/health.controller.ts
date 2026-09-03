import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { apiData } from "@social-monitor/shared";
import { HealthService } from "./health.service";
import { Public } from "../auth/public.decorator";

@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  getHealth() {
    return this.health.overview().then((overview) => apiData(overview));
  }

  @Get("db")
  async getDbHealth() {
    const status = await this.health.checkDatabase();
    if (status === "down") {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: "Database unavailable",
        code: "DB_UNAVAILABLE"
      });
    }
    return apiData({ database: "connected" });
  }
}
