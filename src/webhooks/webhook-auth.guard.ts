import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import { createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  type AuthenticatedWebhookRequest,
  type WebhookPermission,
} from './webhook.types';
import { WEBHOOK_PERMISSIONS as WEBHOOK_PERMISSION_METADATA } from './webhook-auth.decorator';

const MAX_DRIFT_MS = 15_000;

@Injectable()
export class WebhookAuthGuard implements CanActivate {
  private readonly publicKey: ReturnType<typeof importPublicKey>;
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.publicKey = importPublicKey(
      config.getOrThrow<string>('IDENTITY_PUBLIC_KEY'),
    );
    this.encryptionKey = Buffer.from(
      config.getOrThrow<string>('WEBHOOK_ENCRYPTION_KEY'),
      'base64',
    );
    if (this.encryptionKey.length !== 32) {
      throw new Error('WEBHOOK_ENCRYPTION_KEY must decode to 32 bytes');
    }
  }

  async canActivate(context: ExecutionContext) {
    const required =
      this.reflector.getAllAndOverride<WebhookPermission[]>(
        WEBHOOK_PERMISSION_METADATA,
        [context.getHandler(), context.getClass()],
      ) ?? [];
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedWebhookRequest>();
    const token = this.bearerToken(request.headers.authorization);
    const timestampHeader = request.headers['x-timestamp'];
    const signatureHeader = request.headers['x-signature'];

    if (!token) throw new UnauthorizedException({ error: 'Unauthorized' });
    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) {
      throw new BadRequestException({ error: 'Invalid timestamp' });
    }
    if (Math.abs(Date.now() - timestamp * 1000) > MAX_DRIFT_MS) {
      throw new BadRequestException({ error: 'Expired' });
    }
    if (typeof signatureHeader !== 'string') {
      throw new BadRequestException({ error: 'Missing signature' });
    }

    const verified = await jwtVerify<{
      id: string;
      user: string;
      permissions: string[];
    }>(token, await this.publicKey).catch(() => null);
    if (!verified) throw new UnauthorizedException({ error: 'Unauthorized' });
    if (
      !Array.isArray(verified.payload.permissions) ||
      !required.every((permission) =>
        verified.payload.permissions.includes(permission),
      )
    ) {
      throw new ForbiddenException({ error: 'Forbidden' });
    }

    const webhookToken = await this.prisma.client.webhookToken.findUnique({
      where: { id: verified.payload.id },
      select: { secret: true },
    });
    if (!webhookToken)
      throw new UnauthorizedException({ error: 'Unauthorized' });

    const rawBody = request.rawBody;
    if (!rawBody) throw new BadRequestException({ error: 'Invalid raw body' });
    const expected = createHmac('sha256', this.decrypt(webhookToken.secret))
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');
    const received = Buffer.from(signatureHeader, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (
      received.length !== expectedBuffer.length ||
      !timingSafeEqual(received, expectedBuffer)
    ) {
      throw new UnauthorizedException({ error: 'Invalid signature' });
    }

    request.webhookUser = { id: verified.payload.user };
    return true;
  }

  private bearerToken(header?: string) {
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    return token || null;
  }

  private decrypt(value: string) {
    const [ivText = '', contentText = '', tagText = ''] = value.split(':');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivText, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(contentText, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

async function importPublicKey(value: string) {
  const { importSPKI } = await import('jose');
  return importSPKI(value.replaceAll('\\n', '\n'), 'RS256');
}
