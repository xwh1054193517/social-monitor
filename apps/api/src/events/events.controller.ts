import { Controller, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { SseService } from "./sse.service";

@Controller()
export class EventsController {
  constructor(private readonly sse: SseService) {}

  @Sse("events")
  events(): Observable<{ data: string }> {
    return this.sse.events.pipe(
      map((event) => ({ data: JSON.stringify(event) }))
    );
  }
}
