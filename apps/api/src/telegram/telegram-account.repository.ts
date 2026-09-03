import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TelegramAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUnique(phone: string) {
    return this.prisma.telegramAccount.findFirst({ where: { phone } });
  }

  /**
   * Creates or updates an account by phone, storing the AES-256-GCM encrypted
   * session. One account is expected per phone (enforced by the login flow).
   */
  async upsert(
    phone: string,
    encryptedSession: string,
    connected: boolean
  ): Promise<void> {
    const existing = await this.findUnique(phone);
    if (existing) {
      await this.prisma.telegramAccount.update({
        where: { id: existing.id },
        data: { session: encryptedSession, connected }
      });
    } else {
      await this.prisma.telegramAccount.create({
        data: { phone, session: encryptedSession, connected }
      });
    }
  }

  findConnected() {
    return this.prisma.telegramAccount.findMany({
      where: { connected: true }
    });
  }

  update(id: string, data: Prisma.TelegramAccountUpdateInput) {
    return this.prisma.telegramAccount.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.telegramAccount.delete({ where: { id } });
  }
}
