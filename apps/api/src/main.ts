import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.ALL },
      { path: "health/(.*)", method: RequestMethod.ALL }
    ]
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>("API_PORT", 3001);
  await app.listen(port);
}

void bootstrap();
