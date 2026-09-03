import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EncryptionService } from "./encryption.service";

@Global()
@Module({
  providers: [
    {
      provide: EncryptionService,
      useFactory: (config: ConfigService) =>
        new EncryptionService(config.get<string>("ENCRYPTION_KEY", "")),
      inject: [ConfigService]
    }
  ],
  exports: [EncryptionService]
})
export class CryptoModule {}
