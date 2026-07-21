import { Injectable } from '@nestjs/common';
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
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${this.guildId}/members/${discordId}`,
      { headers: { Authorization: `Bot ${this.botToken}` } },
    );
    return response.ok;
  }
}
