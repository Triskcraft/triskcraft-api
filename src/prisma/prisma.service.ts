import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { createPrismaClient, PrismaClient } from '@triskcraft/db';

@Injectable()
export class PrismaService implements OnApplicationShutdown {
  readonly client: PrismaClient = createPrismaClient();

  async onApplicationShutdown() {
    await this.client.$disconnect();
  }
}
