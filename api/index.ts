import { ExpressAdapter } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';

const server = express();
let application: Promise<void> | undefined;

function initialize() {
  application ??= NestFactory.create(AppModule, new ExpressAdapter(server), {
    rawBody: true,
  }).then(async (app) => {
    configureApplication(app);
    await app.init();
  });
  return application;
}

export default async function handler(
  request: express.Request,
  response: express.Response,
) {
  await initialize();
  server(request, response);
}
