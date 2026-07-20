import { Injectable } from '@nestjs/common';
import type { BlogPost } from '@triskcraft/api-types';
import type { Prisma } from '@triskcraft/db';
import { PrismaService } from '../prisma/prisma.service';

const postQuery = {
  omit: {
    thread_id: true,
    user_id: true,
    status: true,
    cover_media_id: true,
  },
  include: {
    cover_media: true,
    post_blocks: {
      orderBy: { timestamp: 'asc' as const },
      include: {
        media: {
          orderBy: { position: 'asc' as const },
          include: { media: true },
        },
      },
      omit: { post_id: true, message_id: true, author_id: true },
    },
    user: {
      select: {
        discord_user: true,
        linked_roles: {
          select: { role: { select: { name: true } } },
        },
        mc_player: {
          select: {
            digs: true,
            uuid: true,
            nickname: true,
            linked_roles: {
              select: { role: { omit: { id: true } } },
            },
          },
        },
      },
    },
  },
} as const;

type PostRecord = Prisma.PostGetPayload<typeof postQuery>;

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<BlogPost[]> {
    const posts = await this.prisma.client.post.findMany({
      where: { status: { not: 'DRAFT' } },
      ...postQuery,
    });
    return posts.map((post) => this.mapPost(post));
  }

  async findById(id: string): Promise<BlogPost | null> {
    const post = await this.prisma.client.post.findFirst({
      where: { status: { not: 'DRAFT' }, id },
      ...postQuery,
    });
    return post ? this.mapPost(post) : null;
  }

  private mapPost(post: PostRecord): BlogPost {
    const {
      created_at,
      cover_media,
      id,
      title,
      post_blocks,
      updated_at,
      user,
    } = post;
    return {
      id,
      title,
      cover_image: cover_media?.media_type === 'IMAGE' ? cover_media : null,
      user: user.discord_user,
      created_at: created_at.getTime(),
      updated_at: updated_at.getTime(),
      player: user.mc_player
        ? {
            ...user.mc_player,
            rank: user.linked_roles[0]?.role.name ?? 'Miembro',
            roles: user.mc_player.linked_roles.map(({ role }) => role.name),
          }
        : null,
      post_blocks: post_blocks.map((block) => ({
        ...block,
        media: block.media.map(({ media }) => media),
        timestamp: block.timestamp.getTime(),
      })),
    };
  }
}
