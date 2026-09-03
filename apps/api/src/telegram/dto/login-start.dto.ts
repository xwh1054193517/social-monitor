import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class LoginStartDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone!: string;
}
