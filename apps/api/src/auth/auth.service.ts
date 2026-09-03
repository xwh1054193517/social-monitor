import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface AuthTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface LoginResult {
  token: string;
  expiresIn: number;
}

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;
const FALLBACK_SECRET = "social-monitor-insecure-dev-secret";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still perform a comparison to keep timing uniform for equal-length
    // secrets; length itself is not sensitive here (usernames/passwords
    // vary in length anyway).
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Minimal HMAC-signed bearer token (JWT-style, zero dependencies).
 *
 *   token := base64url(payloadJson) + "." + base64url(hmacSha256(payloadPart))
 *
 * Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD env vars. The system
 * intentionally supports a single admin account only.
 */
@Injectable()
export class AuthService {
  private readonly username: string;
  private readonly password: string;
  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(config: ConfigService) {
    this.username = config.get<string>("ADMIN_USERNAME") ?? "";
    this.password = config.get<string>("ADMIN_PASSWORD") ?? "";
    this.secret =
      config.get<string>("AUTH_SECRET")?.trim() || FALLBACK_SECRET;
    const ttlRaw = config.get<string>("AUTH_TTL_SECONDS");
    this.ttlSeconds = ttlRaw ? Number(ttlRaw) : DEFAULT_TTL_SECONDS;
    if (!Number.isFinite(this.ttlSeconds) || this.ttlSeconds <= 0) {
      this.ttlSeconds = DEFAULT_TTL_SECONDS;
    }
  }

  login(username: string, password: string): LoginResult {
    if (this.username === "" || this.password === "") {
      throw new UnauthorizedException("管理员账号未配置");
    }
    const ok =
      safeEqual(username, this.username) && safeEqual(password, this.password);
    if (!ok) {
      throw new UnauthorizedException("用户名或密码错误");
    }
    return { token: this.sign(username), expiresIn: this.ttlSeconds };
  }

  sign(subject: string): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload: AuthTokenPayload = {
      sub: subject,
      iat: issuedAt,
      exp: issuedAt + this.ttlSeconds
    };
    const payloadPart = Buffer.from(JSON.stringify(payload)).toString(
      "base64url"
    );
    const signaturePart = createHmac("sha256", this.secret)
      .update(payloadPart)
      .digest("base64url");
    return `${payloadPart}.${signaturePart}`;
  }

  verify(token: string): AuthTokenPayload | null {
    const parts = token.split(".");
    if (parts.length !== 2) {
      return null;
    }
    const payloadPart = parts[0]!;
    const signaturePart = parts[1]!;

    let payload: AuthTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(payloadPart, "base64url").toString("utf8")
      ) as AuthTokenPayload;
    } catch {
      return null;
    }

    if (
      typeof payload.sub !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }

    const expected = createHmac("sha256", this.secret)
      .update(payloadPart)
      .digest("base64url");
    if (!safeEqual(signaturePart, expected)) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  }
}
