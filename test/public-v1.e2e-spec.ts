import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';

const player = {
  uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
  nickname: 'Notch',
  digs: 42,
  description: 'Builder',
  medias: [{ type: 'avatar', url: 'https://example.com/avatar.png' }],
  linked_roles: [{ role: { name: 'Architect' } }],
  user: { id: 'user-1', linked_roles: [{ role: { name: 'Admin' } }] },
};

const post = {
  id: 'post-1',
  title: 'Hello world',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
  cover_media: {
    id: 'media-1',
    filename: 'cover.png',
    url: 'https://example.com/cover.png',
    content_type: 'image/png',
    media_type: 'IMAGE',
    size: 123,
    width: 100,
    height: 50,
    description: null,
    hash: null,
  },
  user: {
    discord_user: { id: 'discord-1', username: 'author' },
    linked_roles: [{ role: { name: 'Writer' } }],
    mc_player: {
      uuid: player.uuid,
      nickname: player.nickname,
      digs: player.digs,
      linked_roles: [{ role: { name: 'Architect' } }],
    },
  },
  post_blocks: [
    {
      timestamp: new Date('2026-01-01T01:00:00.000Z'),
      content: 'Body',
      components: [],
      embeds: [],
      media: [
        {
          media: {
            id: 'media-2',
            filename: 'body.png',
            url: 'https://example.com/body.png',
            content_type: 'image/png',
            media_type: 'IMAGE',
            size: 50,
            width: 10,
            height: 10,
            description: null,
            hash: null,
          },
        },
      ],
    },
  ],
};

describe('Public API v1 (e2e)', () => {
  let app: INestApplication;
  const playerFindMany = jest.fn();
  const postFindMany = jest.fn();
  const postFindFirst = jest.fn();

  beforeAll(async () => {
    playerFindMany.mockResolvedValue([player] as never);
    postFindMany.mockResolvedValue([post] as never);
    postFindFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === post.id ? post : null),
    );

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        client: {
          player: { findMany: playerFindMany },
          post: { findMany: postFindMany, findFirst: postFindFirst },
        },
      })
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it('GET /v1/members returns the legacy member contract and cache header', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get('/v1/members')
      .expect(200)
      .expect('Cache-Control', 'public, max-age=86400');

    expect(response.body).toEqual([
      {
        description: 'Builder',
        digs: 42,
        mc_name: 'Notch',
        mc_uuid: player.uuid,
        medias: player.medias,
        rank: 'Admin',
        roles: ['Architect'],
      },
    ]);
  });

  it('GET /v1/games/minecraft/players supports repeated includes', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get('/v1/games/minecraft/players?includes=roles&includes=rank')
      .expect(200);

    expect(response.body).toEqual([
      {
        digs: 42,
        nickname: 'Notch',
        uuid: player.uuid,
        user_id: 'user-1',
        rank: 'Admin',
        roles: ['Architect'],
      },
    ]);
  });

  it('GET /v1/posts returns the legacy blog post contract', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get('/v1/posts')
      .expect(200)
      .expect('Cache-Control', 'public, max-age=86400');

    expect(response.body[0]).toMatchObject({
      id: 'post-1',
      created_at: post.created_at.getTime(),
      updated_at: post.updated_at.getTime(),
      player: { rank: 'Writer', roles: ['Architect'] },
      post_blocks: [{ timestamp: post.post_blocks[0].timestamp.getTime() }],
    });
  });

  it('GET /v1/posts/:id returns a post and preserves the legacy 404', async () => {
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/v1/posts/post-1')
      .expect(200);

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/v1/posts/missing')
      .expect(404)
      .expect({ error: 'NotFound' });
  });
});
