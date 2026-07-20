import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './configure-application';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApplication(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
