import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { AuthService } from "./auth.service";

/** Minimal shape of the HTTP request fields the guard inspects. */
interface GuardRequest {
  headers: { authorization?: string };
  query?: { token?: unknown };
  user?: { username: string };
}

export interface AuthenticatedRequest extends GuardRequest {
  user: { username: string };
}

function extractToken(request: GuardRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token) {
      return token;
    }
  }
  // EventSource (SSE) cannot set custom headers; allow the token via query.
  const queryToken = request.query?.token;
  if (typeof queryToken === "string" && queryToken) {
    return queryToken;
  }
  return null;
}

/**
 * Global guard protecting every /api route except those marked @Public().
 * Accepts `Authorization: Bearer <token>` or `?token=` (for SSE).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractToken(request);
    const payload = token ? this.authService.verify(token) : null;
    if (!payload) {
      throw new UnauthorizedException("未登录或登录已过期");
    }
    request.user = { username: payload.sub };
    return true;
  }
}
