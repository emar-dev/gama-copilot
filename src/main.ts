// Doit rester le premier import : certains modules lisent process.env dès leur chargement.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  // Les réponses de l'agent (modèles locaux) peuvent dépasser les 5 min par défaut de Node.
  const server = app.getHttpServer() as {
    requestTimeout: number;
    headersTimeout: number;
  };
  server.requestTimeout = Number(
    process.env.HTTP_REQUEST_TIMEOUT_MS || 900_000,
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
