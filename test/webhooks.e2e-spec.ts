import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { createCipheriv, createHmac } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';
import { WebhookDiscordService } from '../src/webhooks/webhook-discord.service';

describe('Signed webhooks (e2e)', () => {
  let app: INestApplication;
  let privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  const playerUpdate = jest.fn(() => Promise.resolve({}));
  const linkCodeFindUnique = jest.fn(() =>
    Promise.resolve({ discord_id: 'discord-1' }),
  );
  const transaction = {
    player: {
      upsert: jest.fn(() => Promise.resolve({ uuid: 'minecraft-uuid' })),
    },
    user: { upsert: jest.fn(() => Promise.resolve({})) },
    linkCode: { delete: jest.fn(() => Promise.resolve({})) },
  };
  const prisma = {
    client: {
      webhookToken: {
        findUnique: jest.fn(() =>
          Promise.resolve({ secret: encryptedSecret() }),
        ),
      },
      player: { update: playerUpdate },
      linkCode: { findUnique: linkCodeFindUnique },
      $transaction: jest.fn(
        (callback: (value: typeof transaction) => unknown) =>
          Promise.resolve(callback(transaction)),
      ),
    },
  };
  const discord = { getGuildMember: jest.fn(() => Promise.resolve(true)) };

  beforeAll(async () => {
    privateKey = await importPKCS8(
      process.env.IDENTITY_PRIVATE_KEY!.replaceAll('\\n', '\n'),
      'RS256',
    );
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(WebhookDiscordService)
      .useValue(discord)
      .compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('accepts a valid JWT, permission and raw-body HMAC', async () => {
    const body = '[{"nickname":"Steve","digs":12}]';
    const response = await sendSigned('/webhooks/digs', body, 'digs');
    expect(response.status).toBe(200);
    expect(playerUpdate).toHaveBeenCalledWith({
      where: { nickname: 'Steve', status: 'ACTIVE' },
      data: { digs: 12 },
    });
  });

  it('rejects a token without the route permission', async () => {
    const response = await sendSigned(
      '/webhooks/join',
      '{"nickname":"Steve"}',
      'digs',
    );
    expect(response.status).toBe(403);
  });

  it('rejects an invalid HMAC and a modified payload', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const token = await webhookToken('join');
    const signature = signBody(timestamp, '{"nickname":"Steve"}');
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/webhooks/join')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Timestamp', String(timestamp))
      .set('X-Signature', signature)
      .send('{"nickname":"Alex"}')
      .type('application/json');
    expect(response.status).toBe(401);
  });

  it('rejects timestamps outside the existing 15-second window', async () => {
    const timestamp = Math.floor((Date.now() - 16_000) / 1000);
    const token = await webhookToken('join');
    const body = '{"nickname":"Steve"}';
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/webhooks/join')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Timestamp', String(timestamp))
      .set('X-Signature', signBody(timestamp, body))
      .send(body)
      .type('application/json');
    expect(response.status).toBe(400);
  });

  it('runs join and link through the API without a Discord client', async () => {
    const join = await sendSigned(
      '/webhooks/join',
      '{"nickname":"Steve"}',
      'join',
    );
    expect(join.status).toBe(200);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'minecraft-uuid' }), { status: 200 }),
      ),
    );
    try {
      const link = await sendSigned(
        '/webhooks/link',
        '{"nickname":"Steve","code":"link-code"}',
        'link',
      );
      expect(link.status).toBe(200);
      expect(discord.getGuildMember).toHaveBeenCalledWith('discord-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  async function sendSigned(path: string, body: string, permission: string) {
    const timestamp = Math.floor(Date.now() / 1000);
    const token = await webhookToken(permission);
    return request(app.getHttpServer() as Parameters<typeof request>[0])
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Timestamp', String(timestamp))
      .set('X-Signature', signBody(timestamp, body))
      .set('Content-Type', 'application/json')
      .send(body);
  }

  async function webhookToken(permission: string) {
    return new SignJWT({
      id: 'webhook-1',
      user: 'service-user',
      permissions: [permission],
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }

  function signBody(timestamp: number, body: string) {
    return createHmac('sha256', 'webhook-secret')
      .update(`${timestamp}.${body}`)
      .digest('hex');
  }
});

function encryptedSecret() {
  const key = Buffer.alloc(32, 7);
  const iv = Buffer.alloc(12, 3);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const content = Buffer.concat([
    cipher.update('webhook-secret', 'utf8'),
    cipher.final(),
  ]);
  return [
    iv.toString('base64'),
    content.toString('base64'),
    cipher.getAuthTag().toString('base64'),
  ].join(':');
}
