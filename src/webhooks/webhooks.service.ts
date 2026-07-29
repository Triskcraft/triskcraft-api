import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Inject } from '@nestjs/common';
import { DIGS_QUEUE, type DigsQueue } from './digs-queue';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookDiscordService } from './webhook-discord.service';

export const digsEntry = z.union([
  z.object({
    nickname: z.string().min(1, 'El nombre de usuario es obligatorio'),
    uuid: z.string().min(1, 'El id de usuario es obligatorio').optional(),
    digs: z.number().min(0, 'La cantidad de digs debe ser positiva'),
  }),
  z.object({
    nickname: z
      .string()
      .min(1, 'El nombre de usuario es obligatorio')
      .optional(),
    uuid: z.string().min(1, 'El id de usuario es obligatorio'),
    digs: z.number().min(0, 'La cantidad de digs debe ser positiva'),
  }),
]);
const digsSchema = z.array(digsEntry);
const joinSchema = z.object({
  nickname: z.string().min(1, 'El nombre de usuario es obligatorio'),
});
const linkSchema = z.object({
  nickname: z.string().min(1, 'El nombre de usuario es obligatorio'),
  code: z.string().min(1, 'El código es obligatorio'),
});

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discord: WebhookDiscordService,
    @Inject(DIGS_QUEUE) private readonly digsQueue: DigsQueue,
  ) {}

  async enqueueDigs(rawBody: Buffer) {
    const body = this.parseJson(rawBody);
    const parsed = digsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'Invalid payload',
        details: z.treeifyError(parsed.error),
      });
    }
    await this.digsQueue.enqueue(parsed.data);
    return {};
  }

  async join(rawBody: Buffer) {
    const parsed = joinSchema.safeParse(this.parseJson(rawBody));
    if (!parsed.success)
      throw new BadRequestException({
        error: 'Invalid payload',
        details: z.treeifyError(parsed.error),
      });
    try {
      await this.prisma.client.player.update({
        where: { nickname: parsed.data.nickname },
        data: {
          last_seen: new Date(),
        },
      });
      return {};
    } catch (error) {
      if (isPrismaNotFound(error)) {
        throw new NotFoundException({ error: 'Jugador no encontrado' });
      }
      throw new InternalServerErrorException({
        error: 'Error al registrar la sesión',
      });
    }
  }

  async link(rawBody: Buffer) {
    const parsed = linkSchema.safeParse(this.parseJson(rawBody));
    if (!parsed.success)
      throw new BadRequestException({
        error: 'Invalid payload',
        details: z.treeifyError(parsed.error),
      });
    const code = await this.prisma.client.linkCode.findUnique({
      where: { code: parsed.data.code },
    });
    if (!code) throw new NotFoundException({ error: 'Código no encontrado' });
    if (!(await this.discord.getGuildMember(code.discord_id))) {
      throw new BadRequestException({ error: 'discord_id no encontrado' });
    }
    const uuid = await this.nicknameToUuid(parsed.data.nickname);
    if (!uuid)
      throw new BadRequestException({ error: 'nickname no encontrado' });

    try {
      const user = await this.prisma.client.$transaction(
        async (transaction) => {
          const player = await transaction.player.upsert({
            where: { uuid },
            create: { nickname: parsed.data.nickname, uuid },
            update: { nickname: parsed.data.nickname, status: 'ACTIVE' },
            select: { uuid: true },
          });
          await transaction.user.upsert({
            where: { discord_user_id: code.discord_id },
            create: {
              discord_user: { connect: { id: code.discord_id } },
              mc_player: { connect: { uuid: player.uuid } },
            },
            update: { mc_player: { connect: { uuid: player.uuid } } },
          });
          await transaction.linkCode.delete({
            where: { code: parsed.data.code },
          });
          return player;
        },
      );
      return user;
    } catch {
      throw new InternalServerErrorException({
        error: 'Error al vincular la cuenta',
      });
    }
  }

  private parseJson(rawBody: Buffer) {
    try {
      return JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException({ error: 'Invalid JSON' });
    }
  }

  private async nicknameToUuid(nickname: string) {
    const response = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(nickname)}`,
    );
    if (response.status !== 200) return null;
    const body = (await response.json()) as { id?: string };
    return body.id ?? null;
  }
}

function isPrismaNotFound(error: unknown): error is { code: 'P2025' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2025'
  );
}
