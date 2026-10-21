import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['log', 'warn', 'error'] });
  // La web (pieza 5) se sirve desde ../web. En producción va en su propio contenedor.
  app.useStaticAssets(join(__dirname, '..', '..', 'web'));
  app.enableCors();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Catálogo SIB (demo) en http://localhost:${port}`);
}
bootstrap();
