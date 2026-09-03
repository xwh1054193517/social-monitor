import { Body, Controller, Get, Post } from "@nestjs/common";
import { TelegramAuthService } from "./telegram-auth.service";
import { TelegramService } from "./telegram.service";
import { LoginCodeDto } from "./dto/login-code.dto";
import { LoginPasswordDto } from "./dto/login-password.dto";
import { LoginStartDto } from "./dto/login-start.dto";

@Controller("telegram")
export class TelegramController {
  constructor(
    private readonly auth: TelegramAuthService,
    private readonly telegram: TelegramService
  ) {}

  @Post("login/start")
  loginStart(@Body() dto: LoginStartDto) {
    return this.auth.startLogin(dto);
  }

  @Post("login/code")
  loginCode(@Body() dto: LoginCodeDto) {
    return this.auth.submitCode(dto);
  }

  @Post("login/password")
  loginPassword(@Body() dto: LoginPasswordDto) {
    return this.auth.submitPassword(dto);
  }

  @Get("status")
  status() {
    return this.telegram.getStatus();
  }

  @Get("dialogs")
  dialogs() {
    return this.telegram.getDialogs();
  }

  @Get("channels")
  channels() {
    return this.telegram.getChannels();
  }

  @Get("groups")
  groups() {
    return this.telegram.getGroups();
  }

  @Post("reconnect")
  reconnect() {
    return this.telegram.reconnect();
  }

  @Post("logout")
  logout() {
    return this.telegram.logout();
  }
}
