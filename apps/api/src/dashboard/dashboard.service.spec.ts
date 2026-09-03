import { DashboardRepository } from "./dashboard.repository";
import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  let service: DashboardService;
  let repo: {
    countMessages: jest.Mock;
    countMonitors: jest.Mock;
    countTasks: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      countMessages: jest.fn(),
      countMonitors: jest.fn(),
      countTasks: jest.fn()
    };
    service = new DashboardService(repo as unknown as DashboardRepository);
  });

  it("aggregates today's metrics with correct filters", async () => {
    repo.countMessages
      .mockResolvedValueOnce(42)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(35);
    repo.countMonitors.mockResolvedValue(5);
    repo.countTasks.mockResolvedValueOnce(18).mockResolvedValueOnce(2);

    const result = await service.overview();

    expect(repo.countMessages).toHaveBeenNthCalledWith(1, {
      publishedAt: { gte: expect.any(Date) }
    });
    expect(repo.countMessages).toHaveBeenNthCalledWith(2, {
      source: "X",
      publishedAt: { gte: expect.any(Date) }
    });
    expect(repo.countMessages).toHaveBeenNthCalledWith(3, {
      source: "TELEGRAM",
      publishedAt: { gte: expect.any(Date) }
    });
    expect(repo.countMonitors).toHaveBeenCalledWith({ enabled: true });
    expect(repo.countTasks).toHaveBeenNthCalledWith(1, {
      status: "SENT",
      sentAt: { gte: expect.any(Date) }
    });
    expect(repo.countTasks).toHaveBeenNthCalledWith(2, {
      status: "FAILED",
      createdAt: { gte: expect.any(Date) }
    });

    expect(result).toEqual({
      data: {
        todayMessages: 42,
        xMessages: 7,
        telegramMessages: 35,
        monitors: 5,
        notificationSent: 18,
        notificationFailed: 2
      }
    });
  });
});
