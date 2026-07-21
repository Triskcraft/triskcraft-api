import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const DIGS_QUEUE = Symbol('DIGS_QUEUE');

export interface DigsQueueEntry {
  nickname?: string;
  uuid?: string;
  digs: number;
}

export interface DigsQueue {
  enqueue(entries: readonly DigsQueueEntry[]): Promise<void>;
}

@Injectable()
export class InMemoryDigsQueue implements DigsQueue {
  private readonly entries = new Map<
    string,
    { kind: 'uuid' | 'nickname'; digs: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  enqueue(entries: readonly DigsQueueEntry[]): Promise<void> {
    for (const entry of entries) {
      const identifier = entry.uuid ?? entry.nickname;
      if (!identifier) continue;
      this.entries.set(identifier, {
        kind: entry.uuid ? 'uuid' : 'nickname',
        digs: entry.digs,
      });
    }
    return Promise.resolve();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async process() {
    const batch = new Map(this.entries);
    this.entries.clear();
    for (const [identifier, entry] of batch) {
      try {
        await this.prisma.client.player.update({
          where:
            entry.kind === 'uuid'
              ? { uuid: identifier, status: 'ACTIVE' }
              : { nickname: identifier, status: 'ACTIVE' },
          data: { digs: entry.digs },
        });
      } catch (error) {
        if (!isPrismaNotFound(error)) {
          // Events are intentionally best-effort while this queue is in memory.
          console.error('Error updating digs', error);
        }
      }
    }
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
