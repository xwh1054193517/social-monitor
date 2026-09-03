import { MonitorType } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength
} from "class-validator";

export class CreateMonitorDto {
  @IsEnum(MonitorType, {
    message: "type must be one of: X_USER, TG_CHANNEL, TG_GROUP"
  })
  type!: MonitorType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalId?: string;
}
