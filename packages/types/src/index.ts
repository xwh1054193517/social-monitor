export type MessageSource = "X" | "TELEGRAM";

export type MonitorTargetType = "X_USER" | "TG_CHANNEL" | "TG_GROUP";

export interface NormalizedMessage {
  source: MessageSource;
  externalId: string;
  targetExternalId: string;
  targetType: MonitorTargetType;
  targetName: string;
  author?: {
    externalId?: string;
    username?: string;
    displayName?: string;
  };
  content: string;
  url?: string;
  publishedAt: Date;
}
