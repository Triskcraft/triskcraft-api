import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DiscordAccessToken, DiscordUser } from './auth.types';

@Injectable()
export class DiscordOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly guildId: string;
  private readonly botToken: string;

  constructor(config: ConfigService) {
    this.clientId = config.getOrThrow<string>('DISCORD_CLIENT_ID');
    this.clientSecret = config.getOrThrow<string>('DISCORD_CLIENT_SECRET');
    this.redirectUri = config.getOrThrow<string>('DISCORD_REDIRECT_URI');
    this.guildId = config.getOrThrow<string>('DISCORD_GUILD_ID');
    this.botToken = config.getOrThrow<string>('DISCORD_REST_TOKEN');
  }

  authorizationUrl(state: string) {
    return `https://discord.com/oauth2/authorize?${new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: 'identify guilds guilds.join',
      state,
    })}`;
  }

  async exchangeCode(code: string): Promise<DiscordAccessToken | null> {
    return this.requestToken({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });
  }

  async refreshToken(refreshToken: string): Promise<DiscordAccessToken | null> {
    return this.requestToken({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  async getUser(accessToken: string): Promise<DiscordUser | null> {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.ok ? ((await response.json()) as DiscordUser) : null;
  }

  async ensureGuildMembership(accessToken: string, userId: string) {
    const guilds = await fetch(
      'https://discord.com/api/v10/users/@me/guilds?limit=200',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!guilds.ok) return false;
    const memberships = (await guilds.json()) as { id: string }[];
    if (memberships.some(({ id }) => id === this.guildId)) return true;

    const joined = await fetch(
      `https://discord.com/api/v10/guilds/${this.guildId}/members/${userId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: accessToken }),
      },
    );
    return joined.ok;
  }

  private async requestToken(
    values: Record<string, string>,
  ): Promise<DiscordAccessToken | null> {
    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values),
    });
    return response.ok ? ((await response.json()) as DiscordAccessToken) : null;
  }
}
