import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WebhookDiscordService {
  private readonly guildId: string;
  private readonly botToken: string;

  constructor(config: ConfigService) {
    this.guildId = config.getOrThrow<string>('DISCORD_GUILD_ID');
    this.botToken = config.getOrThrow<string>('DISCORD_REST_TOKEN');
  }

  async getGuildMember(discordId: string) {
    try {
      const response = await fetch(
        `https://discord.com/api/v10/guilds/${this.guildId}/members/${discordId}`,
        { headers: { Authorization: `Bot ${this.botToken}` } },
      );
      if (response.status === 404) return false;
      if (!response.ok) {
        throw new ServiceUnavailableException({
          error: 'Discord service unavailable',
        });
      }
      return true;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        error: 'Discord service unavailable',
      });
    }
  }
}
