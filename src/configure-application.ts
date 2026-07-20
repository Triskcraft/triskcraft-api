import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureApplication(app: INestApplication) {
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Triskcraft API')
      .setDescription(
        'Public, OAuth and internal HTTP contracts for Triskcraft.',
      )
      .setVersion('0.1')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
