import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";

export type SseEventType =
  | "message.created"
  | "notification.sent"
  | "notification.failed"
  | "monitor.status_changed";

export interface SseEvent {
  type: SseEventType;
  data: unknown;
  timestamp: string;
}

/**
 * In-process event bus backing the SSE endpoint. Other services emit domain
 * events here; the controller turns the stream into Server-Sent Events.
 */
@Injectable()
export class SseService {
  private readonly stream = new Subject<SseEvent>();

  get events() {
    return this.stream.asObservable();
  }

  emit(type: SseEventType, data: unknown): void {
    this.stream.next({ type, data, timestamp: new Date().toISOString() });
  }
}
