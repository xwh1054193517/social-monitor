import {
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessageRepository } from "../messages/message.repository";
import { MessageService } from "../messages/message.service";
import { Public } from "../auth/public.decorator";
import { IngestTelegramMessageDto } from "./dto/ingest-telegram-message.dto";
import { RawTelegramMessage, TelegramMapper } from "./telegram-mapper";

/**
 * Internal endpoint receiving messages captured by the Python sidecar
 * (`apps/telegram-worker`).
 *
 * Reuses the exact business pipeline the old GramJS listener used:
 * resolve monitored target -> normalize -> MessageService (dedupe, SSE,
 * notification routing). Authenticated via the shared `X-Internal-Secret`
 * header instead of the JWT guard.
 */
@Controller("internal/telegram")
export class TelegramIngestController {
  private readonly logger = new Logger(TelegramIngestController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly messageRepository: MessageRepository,
    private readonly mapper: TelegramMapper,
    private readonly messages: MessageService
  ) {}

  @Public()
  @Post("ingest")
  async ingest(
    @Headers("x-internal-secret") secret: string | undefined,
    @Body() payload: IngestTelegramMessageDto
  ): Promise<{ ingested: boolean; messageId?: string; reason?: string }> {
    const expected = this.config.get<string>("INTERNAL_API_SECRET", "");
    if (!expected || secret !== expected) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: "Invalid internal secret",
        code: "TELEGRAM_INGEST_UNAUTHORIZED"
      });
    }

    const target =
      await this.messageRepository.findTelegramTargetByExternalId(
        payload.chatId
      );
    if (!target) {
      // Chat is not monitored — ignore.
      return { ingested: false, reason: "target_not_monitored" };
    }

    const raw: RawTelegramMessage = {
      chatId: payload.chatId,
      messageId: payload.messageId,
      content: payload.content ?? null,
      date: payload.date,
      sender: payload.sender ?? null
    };
    const externalId = TelegramMapper.buildExternalId(
      payload.chatId,
      payload.messageId
    );
    const normalized = this.mapper.toNormalizedMessage(target, raw, externalId);

    try {
      const saved = await this.messages.create(normalized);
      this.logger.log(
        `message.ingested id=${saved.id} target=${target.name} chatId=${payload.chatId}`
      );
      return { ingested: true, messageId: saved.id };
    } catch (error) {
      this.logger.error(
        `Failed to ingest Telegram message ${externalId}: ${String(error)}`
      );
      return { ingested: false, reason: "ingest_failed" };
    }
  }
}
