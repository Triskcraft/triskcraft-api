import { Module } from '@nestjs/common';
import { WebhookAuthGuard } from './webhook-auth.guard';
import { WebhookDiscordService } from './webhook-discord.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhookAuthGuard, WebhookDiscordService, WebhooksService],
})
export class WebhooksModule {}
