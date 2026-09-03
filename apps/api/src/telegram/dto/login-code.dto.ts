import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class LoginCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code!: string;
}
