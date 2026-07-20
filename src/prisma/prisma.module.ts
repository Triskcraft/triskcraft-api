import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

const prismaProvider = {
  provide: PrismaService,
  useFactory: async () => {
    const { createPrismaClient } = await import('@triskcraft/db');
    return new PrismaService(createPrismaClient());
  },
};

@Global()
@Module({
  providers: [prismaProvider],
  exports: [PrismaService],
})
export class PrismaModule {}
