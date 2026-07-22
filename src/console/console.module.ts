import { Module } from '@nestjs/common';
import { ConsoleController } from './console.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FilesModule } from '../files/files.module';
import { ConsoleService } from './console.service';

@Module({
  imports: [AuthModule, PrismaModule, FilesModule],
  controllers: [ConsoleController],
  providers: [ConsoleService],
})
export class ConsoleModule {}
