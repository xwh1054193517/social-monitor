/**
 * 判断是否为 Prisma 唯一约束冲突错误（P2002）。
 * 用于 source+externalId、messageId+channelId 等幂等写入的并发兜底。
 */
export function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
