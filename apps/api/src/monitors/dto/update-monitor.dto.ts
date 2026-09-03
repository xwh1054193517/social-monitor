import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength
} from "class-validator";

export class UpdateMonitorDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
