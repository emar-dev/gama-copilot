import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';

/** Configuration HTTP partagée par main.ts et les tests e2e. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  // Le front appelle l'API avec credentials: 'include' : l'origine doit être explicite, jamais « * ».
  const origins = (
    config.get<string>('FRONT_ORIGIN') || 'http://localhost:3001'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  // Derrière un reverse proxy (nginx…), nécessaire pour que req.ip soit l'IP réelle du client.
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    const express = app.getHttpAdapter().getInstance() as {
      set: (key: string, value: unknown) => void;
    };
    express.set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true',
    );
  }
}
