import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { PrismaClient } from '@triskcraft/db';

@Injectable()
export class PrismaService implements OnApplicationShutdown {
  constructor(readonly client: PrismaClient) {}

  async onApplicationShutdown() {
    await this.client.$disconnect();
  }
}
