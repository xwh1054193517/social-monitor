import { Module } from "@nestjs/common";
import { QqClientService } from "./qq-client.service";
import { QqGatewayService } from "./qq-gateway.service";

@Module({
  providers: [QqClientService, QqGatewayService],
  exports: [QqClientService, QqGatewayService]
})
export class QqModule {}
