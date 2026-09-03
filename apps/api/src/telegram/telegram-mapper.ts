import { Injectable } from "@nestjs/common";
import { MonitorTarget } from "@prisma/client";
import { Api } from "telegram";
import type { NormalizedMessage } from "@social-monitor/types";

/**
 * Maps a GramJS `Api.Message` to the platform-agnostic `NormalizedMessage`.
 *
 * Hard constraint (Phase 8): media payloads are NEVER downloaded. Only the
 * textual content (`message.message`) is read.
 */
@Injectable()
export class TelegramMapper {
  /**
   * @param target     the resolved MonitorTarget (TG_CHANNEL / TG_GROUP)
   * @param message    the raw GramJS message
   * @param externalId `${chatId}:${message.id}` — globally unique per message
   */
  toNormalizedMessage(
    target: MonitorTarget,
    message: Api.Message,
    externalId: string
  ): NormalizedMessage {
    const sender = message.sender;
    let author: NormalizedMessage["author"];
    if (sender && sender instanceof Api.User) {
      const externalId =
        sender.id != null ? sender.id.toString() : undefined;
      const username = sender.username ?? undefined;
      const displayName =
        [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim() ||
        undefined;
      author = {
        ...(externalId !== undefined && { externalId }),
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
      // ignored — we never call downloadMedia/downloadFile.
      content: message.message ?? "",
      publishedAt: new Date((message.date ?? 0) * 1000)
    };
  }

  static buildExternalId(chatId: string, messageId: number): string {
    return `${chatId}:${messageId}`;
  }
}
