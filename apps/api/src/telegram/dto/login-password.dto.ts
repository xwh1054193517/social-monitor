import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class LoginPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
