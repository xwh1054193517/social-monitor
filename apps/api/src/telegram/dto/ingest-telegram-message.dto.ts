import { Type } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from "class-validator";

export class IngestSenderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastName?: string;
}

/** Payload POSTed by the Python sidecar for every captured NewMessage. */
export class IngestTelegramMessageDto {
  @IsString()
  @MaxLength(64)
  chatId!: string;

  @IsNumber()
  messageId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  content?: string | null;

  /** Unix seconds. */
  @IsNumber()
  date!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => IngestSenderDto)
  sender?: IngestSenderDto | null;
}
