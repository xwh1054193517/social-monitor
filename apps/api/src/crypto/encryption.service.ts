import { Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";

/**
 * AES-256-GCM encryption used for secrets at rest (Telegram StringSession,
 * NotificationChannel credentials, WeChat webhook URLs).
 *
 * The ciphertext is self-contained: `base64(iv).base64(ciphertext).base64(tag)`,
 * so no key derivation or external IV bookkeeping is required.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(keyHex: string) {
    if (!keyHex || keyHex.length !== 64) {
      throw new Error(
        "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
      );
    }
    this.key = Buffer.from(keyHex, "hex");
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString("base64"),
      encrypted.toString("base64"),
      tag.toString("base64")
    ].join(".");
  }

  decrypt(payload: string): string {
    const parts = payload.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted payload");
    }
    const ivB64 = parts[0]!;
    const encryptedB64 = parts[1]!;
    const tagB64 = parts[2]!;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, "base64")),
      decipher.final()
    ]).toString("utf8");
  }
}
