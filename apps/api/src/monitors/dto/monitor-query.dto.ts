import { MonitorType } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min
} from "class-validator";

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

export class MonitorQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsEnum(MonitorType)
  type?: MonitorType;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  keyword?: string;
}
