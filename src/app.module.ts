import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ConsoleModule } from './console/console.module';
import { environmentSchema } from './config/environment.schema';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { MembersModule } from './members/members.module';
import { PostsModule } from './posts/posts.module';
import { PrismaModule } from './prisma/prisma.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      expandVariables: true,
      isGlobal: true,
      validationSchema: environmentSchema,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    WebhooksModule,
    MembersModule,
    PostsModule,
    ConsoleModule,
    FilesModule,
  ],
})
export class AppModule {}
