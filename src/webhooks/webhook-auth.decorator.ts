import { SetMetadata } from '@nestjs/common';
import type { WebhookPermission } from './webhook.types';

export const WEBHOOK_PERMISSIONS = 'webhook_permissions';

export const RequireWebhookPermissions = (
  ...permissions: WebhookPermission[]
) => SetMetadata(WEBHOOK_PERMISSIONS, permissions);
