import { Module } from '@nestjs/common';
import { ConsoleController } from './console.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ConsoleController],
})
export class ConsoleModule {}
