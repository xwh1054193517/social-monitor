import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { apiData } from "@social-monitor/shared";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { Public } from "./public.decorator";
import type { AuthenticatedRequest } from "./auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return apiData(this.authService.login(dto.username, dto.password));
  }

  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return apiData({ username: request.user?.username ?? "" });
  }
}
