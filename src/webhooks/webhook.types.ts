import type { Request } from 'express';

export type WebhookPermission = 'digs' | 'link' | 'join';

export interface AuthenticatedWebhookRequest extends Request {
  rawBody?: Buffer;
  webhookUser?: { id: string };
}
