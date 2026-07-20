import { Injectable } from '@nestjs/common';
import type { MinecraftPlayer } from '@triskcraft/api-types';
import { PrismaService } from '../prisma/prisma.service';

export interface Member {
  mc_uuid: string;
  mc_name: string;
  rank: string;
  description: string;
  digs: number;
  roles: string[];
  medias: { type: string; url: string }[];
}

export type PlayerInclude = 'roles' | 'medias' | 'rank' | 'description';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMembers(): Promise<Member[]> {
    const members = await this.prisma.client.player.findMany({
      where: { status: 'ACTIVE' },
      include: {
        medias: { select: { type: true, url: true } },
        linked_roles: {
          select: { role: { select: { name: true } } },
        },
        user: {
          select: {
            linked_roles: {
              select: { role: { select: { name: true } } },
            },
          },
        },
      },
    });

    return members.map(
      ({ description, digs, user, linked_roles, medias, nickname, uuid }) => ({
        description,
        digs,
        mc_name: nickname,
        mc_uuid: uuid,
        medias,
        rank: user?.linked_roles[0]?.role.name ?? 'User',
        roles: linked_roles.map(({ role }) => role.name),
      }),
    );
  }

  async findPlayers(
    includes: ReadonlySet<PlayerInclude>,
  ): Promise<MinecraftPlayer[]> {
    const players = await this.prisma.client.player.findMany({
      where: { status: 'ACTIVE', user: { is: {} } },
      include: {
        user: {
          select: {
            id: true,
            linked_roles: {
              select: { role: { select: { name: true } } },
            },
          },
        },
        medias: { select: { type: true, url: true } },
        linked_roles: {
          select: { role: { select: { name: true } } },
        },
      },
    });

    return players.map(
      ({ digs, linked_roles, medias, nickname, uuid, user }) => {
        const player: MinecraftPlayer = {
          digs,
          nickname,
          uuid,
          user_id: user!.id,
        };
        if (includes.has('medias')) player.medias = medias;
        if (includes.has('roles')) {
          player.roles = linked_roles.map(({ role }) => role.name);
        }
        if (includes.has('rank')) {
          player.rank = user?.linked_roles[0]?.role.name ?? 'User';
        }
        return player;
      },
    );
  }
}
