import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireWebhookPermissions } from './webhook-auth.decorator';
import { WebhookAuthGuard } from './webhook-auth.guard';
import type { AuthenticatedWebhookRequest } from './webhook.types';
import { WebhooksService } from './webhooks.service';

@ApiTags('internal webhooks')
@Controller('webhooks')
@UseGuards(WebhookAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('digs')
  @HttpCode(200)
  @RequireWebhookPermissions('digs')
  @ApiOperation({ summary: 'Queue Minecraft digs updates' })
  digs(@Req() request: AuthenticatedWebhookRequest) {
    return this.webhooks.enqueueDigs(request.rawBody!);
  }

  @Post('link')
  @HttpCode(200)
  @RequireWebhookPermissions('link')
  @ApiOperation({ summary: 'Link a Discord user to a Minecraft account' })
  link(@Req() request: AuthenticatedWebhookRequest) {
    return this.webhooks.link(request.rawBody!);
  }

  @Post('join')
  @HttpCode(200)
  @RequireWebhookPermissions('join')
  @ApiOperation({ summary: 'Register a Minecraft player session' })
  join(@Req() request: AuthenticatedWebhookRequest) {
    return this.webhooks.join(request.rawBody!);
  }
}
