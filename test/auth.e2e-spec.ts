import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DiscordOAuthService } from '../src/auth/discord-oauth.service';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';

interface StoredCode {
  code: string;
  user_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  expires_at: Date;
  scope: string;
}

interface StoredSession {
  id: string;
  user_id: string;
  client_id: string;
  refresh_token: string;
  expires_at: Date;
  scope: string;
}

describe('OAuth / SSO (e2e)', () => {
  let app: INestApplication;
  const codes = new Map<string, StoredCode>();
  const sessions = new Map<string, StoredSession>();
  let sessionSequence = 0;

  const discord = {
    authorizationUrl: jest.fn(
      (state: string) => `https://discord.example/authorize?state=${state}`,
    ),
    exchangeCode: jest.fn(),
    refreshToken: jest.fn(),
    getUser: jest.fn(() =>
      Promise.resolve({ id: 'discord-1', username: 'member' }),
    ),
    ensureGuildMembership: jest.fn(() => Promise.resolve(true)),
  };

  const prisma = {
    client: {
      client: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'web-client',
            redirect_uris: ['https://client.example/callback'],
            scopes: ['openid', 'identify', 'minecraft'],
          }),
        ),
      },
      state: {
        findUnique: jest.fn(() => Promise.resolve({ value: 'role-1' })),
      },
      user: {
        upsert: jest.fn(() => Promise.resolve({ id: 'user-1' })),
        findUnique: jest.fn(() =>
          Promise.resolve({
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            linked_roles: [{ role: { name: 'Member' } }],
            discord_user: { id: 'discord-1', username: 'member' },
            mc_player: {
              uuid: 'player-uuid',
              nickname: 'Steve',
              digs: 10,
              medias: [],
              linked_roles: [{ role: { name: 'Builder' } }],
            },
          }),
        ),
      },
      authorizationCode: {
        create: jest.fn(({ data }: { data: StoredCode }) => {
          codes.set(data.code, data);
          return Promise.resolve(data);
        }),
        findUnique: jest.fn(({ where }: { where: { code: string } }) =>
          Promise.resolve(codes.get(where.code) ?? null),
        ),
        delete: jest.fn(({ where }: { where: { code: string } }) => {
          const code = codes.get(where.code);
          if (!code) return Promise.reject(new Error('missing code'));
          codes.delete(where.code);
          return Promise.resolve(code);
        }),
      },
      session: {
        create: jest.fn(({ data }: { data: Omit<StoredSession, 'id'> }) => {
          const stored = { ...data, id: `session-${++sessionSequence}` };
          sessions.set(stored.id, stored);
          return Promise.resolve(stored);
        }),
        findUnique: jest.fn(({ where }: { where: { refresh_token: string } }) =>
          Promise.resolve(
            [...sessions.values()].find(
              (session) => session.refresh_token === where.refresh_token,
            ) ?? null,
          ),
        ),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string; refresh_token: string };
            data: Partial<StoredSession>;
          }) => {
            const session = sessions.get(where.id);
            if (!session || session.refresh_token !== where.refresh_token) {
              return Promise.resolve({ count: 0 });
            }
            sessions.set(where.id, { ...session, ...data });
            return Promise.resolve({ count: 1 });
          },
        ),
        delete: jest.fn(({ where }: { where: { id: string } }) => {
          sessions.delete(where.id);
          return Promise.resolve({});
        }),
      },
    },
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(DiscordOAuthService)
      .useValue(discord)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('starts the authorization flow through Discord', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(authorizeUrl('openid identify'))
      .expect(302);

    expect(response.headers.location).toContain('https://discord.example/');
    expect(response.headers['set-cookie']?.[0]).toContain('oauth_ctx=');
  });

  it('refreshes an expiring Discord token before authorizing', async () => {
    discord.refreshToken.mockResolvedValueOnce({
      token_type: 'Bearer',
      access_token: 'discord-refreshed',
      expires_in: 3600,
      refresh_token: 'discord-refresh-2',
      scope: 'identify guilds guilds.join',
    });

    const expiringCookie = encodeURIComponent(
      JSON.stringify({
        token_type: 'Bearer',
        access_token: 'discord-expiring',
        expires_in: 3600,
        refresh_token: 'discord-refresh',
        scope: 'identify guilds guilds.join',
        issued_at: Date.now() - 3_600_000 + 30_000,
      }),
    );
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(authorizeUrl('openid'))
      .set('Cookie', `discord_access=${expiringCookie}`)
      .expect(302);

    expect(discord.refreshToken).toHaveBeenCalledWith('discord-refresh');
    expect(discord.getUser).toHaveBeenCalledWith('discord-refreshed');
    expect(
      response.headers['set-cookie']?.some((cookie: string) =>
        cookie.startsWith('discord_access='),
      ),
    ).toBe(true);
  });

  it('handles the Discord callback and resumes authorization', async () => {
    discord.exchangeCode.mockResolvedValueOnce({
      token_type: 'Bearer',
      access_token: 'discord-callback-access',
      expires_in: 3600,
      refresh_token: 'discord-callback-refresh',
      scope: 'identify guilds guilds.join',
    });
    discord.getUser.mockResolvedValueOnce({
      id: 'discord-1',
      username: 'member',
    });
    discord.ensureGuildMembership.mockResolvedValueOnce(true);

    const authorization = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(authorizeUrl('openid'))
      .expect(302);
    const contextCookie = authorization.headers['set-cookie']?.find(
      (cookie: string) => cookie.startsWith('oauth_ctx='),
    );
    if (!contextCookie) throw new Error('OAuth context cookie was not set');
    const contextValue: string = contextCookie.split(';', 1)[0] ?? '';
    const contextJson = decodeURIComponent(
      contextValue.slice(contextValue.indexOf('=') + 1),
    );
    const state = (JSON.parse(contextJson) as { discord_state: string })
      .discord_state;
    const callback = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/oauth/discord?code=discord-code&state=${state}`)
      .set('Cookie', contextValue)
      .expect(302);

    expect(discord.exchangeCode).toHaveBeenCalledWith('discord-code');
    expect(callback.headers.location).toMatch(/^\/oauth\/authorize\?/);
    expect(
      callback.headers['set-cookie']?.some((cookie: string) =>
        cookie.startsWith('discord_access='),
      ),
    ).toBe(true);
  });

  it('rejects invalid or disallowed scopes', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(authorizeUrl('openid unknown'))
      .expect(200);

    expect(response.text).toContain('Invalid scope.');
  });

  it('completes authorization and rejects an invalid PKCE verifier', async () => {
    const authorization = await authorizeWithDiscord('openid identify');

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/oauth/token')
      .send({
        grant_type: 'authorization_code',
        code: authorization.code,
        client_id: 'web-client',
        redirect_uri: 'https://client.example/callback',
        code_verifier: 'incorrect',
      })
      .expect(400)
      .expect({
        error:
          'PKCE verification failed: code_verifier does not match code_challenge.',
      });
  });

  it('exchanges a code, emits access and ID tokens, and serves scoped identity', async () => {
    const authorization = await authorizeWithDiscord(
      'openid identify minecraft',
    );
    const token = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/oauth/token')
      .send({
        grant_type: 'authorization_code',
        code: authorization.code,
        client_id: 'web-client',
        redirect_uri: 'https://client.example/callback',
        code_verifier: authorization.verifier,
      })
      .expect(200);

    expect(token.body).toMatchObject({
      token_type: 'Bearer',
      expires_in: 86400,
      scope: 'openid identify minecraft',
    });
    expect(token.body.access_token).toEqual(expect.any(String));
    expect(token.body.id_token).toEqual(expect.any(String));
    expect(token.body.refresh_token).toEqual(expect.any(String));

    const profile = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/oauth/me')
      .set('Authorization', `Bearer ${token.body.access_token}`)
      .expect(200);
    expect(profile.body).toMatchObject({
      sub: 'user-1',
      id: 'user-1',
      rank: 'Member',
      discord_user: { id: 'discord-1', username: 'member' },
      mc_player: { nickname: 'Steve', roles: ['Builder'] },
    });
  });

  it('rotates refresh tokens and rejects reuse', async () => {
    const authorization = await authorizeWithDiscord('openid');
    const token = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/oauth/token')
      .send({
        grant_type: 'authorization_code',
        code: authorization.code,
        client_id: 'web-client',
        redirect_uri: 'https://client.example/callback',
        code_verifier: authorization.verifier,
      });
    const oldRefreshToken = token.body.refresh_token as string;

    const rotated = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/oauth/refresh')
      .send({
        grant_type: 'refresh_token',
        client_id: 'web-client',
        redirect_uri: 'https://client.example/callback',
        refresh_token: oldRefreshToken,
      })
      .expect(200);
    expect(rotated.body.refresh_token).not.toBe(oldRefreshToken);

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post('/oauth/refresh')
      .send({
        grant_type: 'refresh_token',
        client_id: 'web-client',
        redirect_uri: 'https://client.example/callback',
        refresh_token: oldRefreshToken,
      })
      .expect(401)
      .expect({ error: 'Unauthorized' });
  });

  async function authorizeWithDiscord(scope: string) {
    const verifier = `verifier-${Math.random()}`;
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const discordCookie = encodeURIComponent(
      JSON.stringify({
        token_type: 'Bearer',
        access_token: 'discord-access',
        expires_in: 3600,
        refresh_token: 'discord-refresh',
        scope: 'identify guilds guilds.join',
      }),
    );
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(authorizeUrl(scope, challenge))
      .set('Cookie', `discord_access=${discordCookie}`)
      .expect(302);
    const callback = new URL(response.headers.location);
    return { code: callback.searchParams.get('code')!, verifier };
  }

  function authorizeUrl(scope: string, challenge = 'challenge') {
    return `/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: 'web-client',
      redirect_uri: 'https://client.example/callback',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      scope,
      state: 'client-state',
    })}`;
  }
});
