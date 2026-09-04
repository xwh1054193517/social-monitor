import { Injectable } from "@nestjs/common";
import { MonitorTarget } from "@prisma/client";
import type { NormalizedMessage } from "@social-monitor/types";

/** Sender info extracted by the Python sidecar from a Telethon message. */
export interface RawTelegramSender {
  id?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Minimal, library-agnostic view of an incoming Telegram message as forwarded
 * by the Python sidecar (Telethon) to the internal ingest endpoint.
 */
export interface RawTelegramMessage {
  chatId: string;
  messageId: number;
  content: string | null;
  /** Unix seconds. */
  date: number;
  sender?: RawTelegramSender | null | undefined;
}

/**
 * Maps a raw Telegram message to the platform-agnostic `NormalizedMessage`.
 *
 * Hard constraint (Phase 8): media payloads are NEVER downloaded. Only the
 * textual content is read.
 */
@Injectable()
export class TelegramMapper {
  /**
   * @param target     the resolved MonitorTarget (TG_CHANNEL / TG_GROUP)
   * @param message    the raw message forwarded by the Python sidecar
   * @param externalId `${chatId}:${messageId}` — globally unique per message
   */
  toNormalizedMessage(
    target: MonitorTarget,
    message: RawTelegramMessage,
    externalId: string
  ): NormalizedMessage {
    const sender = message.sender;
    let author: NormalizedMessage["author"];
    if (sender) {
      const senderExternalId = sender.id;
      const username = sender.username ?? undefined;
      const displayName =
        [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim() ||
        undefined;
      author = {
        ...(senderExternalId !== undefined && { externalId: senderExternalId }),
        ...(username !== undefined && { username }),
        ...(displayName !== undefined && { displayName })
      };
    }

    return {
      source: "TELEGRAM",
      externalId,
      targetExternalId: target.externalId,
      targetType: target.type,
      targetName: target.name,
      ...(author !== undefined && { author }),
      // Only the text content. Media (image/video/file) is intentionally
      // ignored — the sidecar never calls download_media.
      content: message.content ?? "",
      publishedAt: new Date((message.date ?? 0) * 1000)
    };
  }

  static buildExternalId(chatId: string, messageId: number): string {
    return `${chatId}:${messageId}`;
  }
}
