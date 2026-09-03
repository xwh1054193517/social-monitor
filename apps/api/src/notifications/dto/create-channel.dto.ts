import { NotificationChannelType } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength
} from "class-validator";

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsEnum(NotificationChannelType, {
    message: "type must be one of: TELEGRAM, WECHAT, QQ"
  })
  type!: NotificationChannelType;

  @IsObject()
  config!: Record<string, unknown>;
}
