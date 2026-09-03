import { SseService } from "./sse.service";

describe("SseService", () => {
  it("emits events to subscribers", () => {
    const service = new SseService();
    const received: unknown[] = [];
    const subscription = service.events.subscribe((event) =>
      received.push(event)
    );

    service.emit("message.created", { id: "msg_1" });
    service.emit("notification.sent", { id: "task_1" });

    expect(received).toHaveLength(2);
    expect(received[0]).toMatchObject({
      type: "message.created",
      data: { id: "msg_1" },
      timestamp: expect.any(String)
    });
    expect(received[1]).toMatchObject({
      type: "notification.sent",
      data: { id: "task_1" }
    });

    subscription.unsubscribe();
  });
});
