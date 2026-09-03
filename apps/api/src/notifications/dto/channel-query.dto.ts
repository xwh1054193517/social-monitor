import { NotificationChannelType } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional } from "class-validator";

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === true || value === "true" || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === "0") {
    return false;
  }
  return value;
};

export class ChannelQueryDto {
  @IsOptional()
  @IsEnum(NotificationChannelType)
  type?: NotificationChannelType;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  enabled?: boolean;
}
