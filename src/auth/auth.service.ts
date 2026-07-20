import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OAuthTokenRequest } from '@triskcraft/api-types';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordOAuthService } from './discord-oauth.service';
import { IdentityService } from './identity.service';
import { OAuthException } from './oauth.exception';
import {
  OAUTH_SCOPES,
  parseScopes,
  serializeScopes,
  type DiscordAccessToken,
} from './auth.types';

const ACCESS_TOKEN_RESPONSE_SECONDS = 60 * 60 * 24;
const SESSION_DAYS = 7;

@Injectable()
export class AuthService {
  private readonly issuer: string;
  private readonly superUserDiscordId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly discord: DiscordOAuthService,
    config: ConfigService,
  ) {
    this.issuer = config.getOrThrow<string>('API_URL');
    this.superUserDiscordId = config.getOrThrow<string>(
      'SUPER_USER_DISCORD_ID',
    );
  }

  async validateAuthorizationRequest(query: Record<string, unknown>) {
    const responseType = this.string(query.response_type);
    const clientId = this.string(query.client_id);
    const redirectUri = this.string(query.redirect_uri);
    const codeChallenge = this.string(query.code_challenge);
    const method = this.string(query.code_challenge_method);

    if (responseType !== 'code') {
      throw new Error('Invalid response_type. Only "code" is supported.');
    }
    if (!query.client_id) throw new Error('Missing client_id.');
    if (!clientId) throw new Error('Invalid client_id.');
    if (!query.redirect_uri) throw new Error('Missing redirect_uri.');
    if (!redirectUri) throw new Error('Invalid redirect_uri.');
    if (!query.code_challenge) throw new Error('Missing code_challenge.');
    if (!codeChallenge) throw new Error('Invalid code_challenge.');
    if (method !== 'S256') {
      throw new Error(
        'Invalid code_challenge_method. Only "S256" is supported.',
      );
    }

    const client = await this.prisma.client.client.findUnique({
      where: { id: clientId },
      select: { id: true, redirect_uris: true, scopes: true },
    });
    if (!client) {
      throw new Error(
        'Invalid client_id. No client found with the provided client_id.',
      );
    }
    if (!client.redirect_uris.includes(redirectUri)) {
      throw new Error(
        'Invalid redirect_uri. The provided redirect_uri is not registered for the given client_id.',
      );
    }

    const requestedScopes = parseScopes(query.scope);
    const requestedNames = new Set(
      typeof query.scope === 'string'
        ? query.scope.split(/\s+/).filter(Boolean)
        : [],
    );
    if (requestedScopes.length !== requestedNames.size) {
      throw new Error('Invalid scope.');
    }
    const allowed = client.scopes.length ? client.scopes : [...OAUTH_SCOPES];
    if (requestedScopes.some((scope) => !allowed.includes(scope))) {
      throw new Error(
        'Invalid scope. The client is not allowed to request one or more scopes.',
      );
    }

    return {
      clientId,
      redirectUri,
      codeChallenge,
      scope: serializeScopes(requestedScopes),
      state: this.string(query.state),
    };
  }

  async completeAuthorization(
    request: Awaited<ReturnType<AuthService['validateAuthorizationRequest']>>,
    discordAccess: DiscordAccessToken,
  ) {
    const discordUser = await this.discord.getUser(discordAccess.access_token);
    if (!discordUser) throw new Error('Discord did not provide the user.');

    const initialRoleKey =
      discordUser.id === this.superUserDiscordId
        ? 'super_role_id'
        : 'default_role_id';
    const initialRole = await this.prisma.client.state.findUnique({
      where: { key: initialRoleKey },
      select: { value: true },
    });
    if (!initialRole) throw new Error('Initial role is not configured.');

    const user = await this.prisma.client.user.upsert({
      where: { discord_user_id: discordUser.id },
      create: {
        discord_user: {
          connectOrCreate: {
            where: { id: discordUser.id },
            create: { id: discordUser.id, username: discordUser.username },
          },
        },
        linked_roles: { create: { role_id: initialRole.value } },
      },
      update: {
        discord_user: { update: { username: discordUser.username } },
      },
    });

    const code = randomBytes(32).toString('hex');
    await this.prisma.client.authorizationCode.create({
      data: {
        code,
        user_id: user.id,
        redirect_uri: request.redirectUri,
        code_challenge: request.codeChallenge,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
        client_id: request.clientId,
        scope: request.scope,
      },
    });
    const session = await this.identity.createSessionToken(
      user.id,
      request.clientId,
      request.scope,
    );
    return { code, session };
  }

  async exchangeAuthorizationCode(body: Partial<OAuthTokenRequest>) {
    this.require(
      body.grant_type === 'authorization_code',
      'Invalid grant_type. Expected "authorization_code".',
    );
    this.require(body.code, 'Missing parameter: code is required.');
    this.require(body.client_id, 'Missing parameter: client_id is required.');
    this.require(
      body.redirect_uri,
      'Missing parameter: redirect_uri is required.',
    );
    this.require(
      body.code_verifier,
      'Missing parameter: code_verifier is required (PKCE).',
    );

    const authCode = await this.prisma.client.authorizationCode.findUnique({
      where: { code: body.code },
      select: {
        client_id: true,
        expires_at: true,
        code_challenge: true,
        redirect_uri: true,
        scope: true,
        user_id: true,
      },
    });
    if (!authCode) {
      throw new OAuthException(
        'The provided authorization code is invalid or not found.',
        400,
      );
    }
    if (authCode.expires_at < new Date()) {
      await this.prisma.client.authorizationCode.delete({
        where: { code: body.code },
      });
      throw new OAuthException(
        'The authorization code has expired. Please request a new one.',
        400,
      );
    }
    if (
      authCode.client_id !== body.client_id ||
      authCode.redirect_uri !== body.redirect_uri
    ) {
      throw new OAuthException(
        'The authorization code was not issued for this client_id and redirect_uri.',
        400,
      );
    }
    if (!this.verifyPkce(body.code_verifier, authCode.code_challenge)) {
      throw new OAuthException(
        'PKCE verification failed: code_verifier does not match code_challenge.',
        400,
      );
    }

    const { user_id: userId } =
      await this.prisma.client.authorizationCode.delete({
        where: { code: body.code },
      });
    const refreshToken = this.generateToken();
    const session = await this.prisma.client.session.create({
      data: {
        expires_at: this.sessionExpiration(),
        client_id: body.client_id,
        user_id: userId,
        scope: authCode.scope,
        refresh_token: this.hash(refreshToken),
      },
    });
    return this.tokenResponse(
      session.id,
      userId,
      body.client_id,
      authCode.scope,
      refreshToken,
    );
  }

  async refresh(body: Record<string, unknown>) {
    this.require(
      body.grant_type === 'refresh_token',
      'Invalid grant_type. Expected "refresh_token".',
    );
    const clientId = this.string(body.client_id);
    const refreshToken = this.string(body.refresh_token);
    this.require(clientId, 'Missing parameter: client_id is required.');
    this.require(refreshToken, 'Missing parameter: refresh_token is required.');
    this.require(
      this.string(body.redirect_uri),
      'Missing parameter: redirect_uri is required.',
    );

    const oldHash = this.hash(refreshToken);
    const session = await this.prisma.client.session.findUnique({
      where: { refresh_token: oldHash },
      select: {
        expires_at: true,
        id: true,
        client_id: true,
        scope: true,
        user_id: true,
      },
    });
    if (!session || session.client_id !== clientId) {
      throw new OAuthException('Unauthorized', 401);
    }
    if (session.expires_at < new Date()) {
      await this.prisma.client.session.delete({ where: { id: session.id } });
      throw new OAuthException('Unauthorized', 401);
    }

    const nextRefreshToken = this.generateToken();
    const updated = await this.prisma.client.session.updateMany({
      where: { id: session.id, refresh_token: oldHash },
      data: {
        expires_at: this.sessionExpiration(),
        refresh_token: this.hash(nextRefreshToken),
      },
    });
    if (updated.count !== 1) throw new OAuthException('Unauthorized', 401);
    return this.tokenResponse(
      session.id,
      session.user_id,
      session.client_id,
      session.scope,
      nextRefreshToken,
    );
  }

  async me(authorization?: string) {
    if (!authorization || !/^Bearer\s+.+$/.test(authorization)) {
      throw new OAuthException('Unauthorized', 401);
    }
    const verified = await this.identity.verifyAccessToken(
      authorization.replace(/^Bearer\s+/, ''),
    );
    if (!verified) throw new OAuthException('Unauthorized', 401);
    const payload = verified.payload;
    const scopes = parseScopes(payload.scope);
    if (!scopes.length) {
      throw new OAuthException('Missing required scope.', 403);
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      select: {
        created_at: true,
        linked_roles: { select: { role: { select: { name: true } } } },
        discord_user: {
          select: { id: true, username: scopes.includes('identify') },
        },
        mc_player: {
          select: {
            uuid: true,
            nickname: true,
            digs: true,
            medias: { select: { type: true, url: true } },
            linked_roles: { select: { role: { select: { name: true } } } },
          },
        },
      },
    });
    if (!user) throw new OAuthException('Internal Server Error', 500);
    const response: Record<string, unknown> = {};
    const rank = user.linked_roles[0]?.role.name ?? 'User';
    if (scopes.includes('openid')) {
      Object.assign(response, {
        sub: payload.sub,
        iss: payload.iss,
        aud: payload.aud,
        exp: payload.exp,
      });
    }
    if (scopes.includes('identify')) {
      Object.assign(response, {
        id: payload.sub,
        rank,
        created_at: user.created_at.getTime(),
        discord_user: user.discord_user,
      });
    }
    if (scopes.includes('minecraft')) {
      response.mc_player = user.mc_player
        ? {
            digs: user.mc_player.digs,
            nickname: user.mc_player.nickname,
            uuid: user.mc_player.uuid,
            rank,
            user_id: payload.sub,
            medias: user.mc_player.medias,
            roles: user.mc_player.linked_roles.map(({ role }) => role.name),
          }
        : null;
    }
    return response;
  }

  private async tokenResponse(
    sessionId: string,
    userId: string,
    clientId: string,
    scope: string,
    refreshToken: string,
  ) {
    const access_token = await this.identity.createAccessToken({
      session_id: sessionId,
      sub: userId,
      client_id: clientId,
      aud: clientId,
      scope,
    });
    return {
      access_token,
      token_type: 'Bearer' as const,
      expires_in: ACCESS_TOKEN_RESPONSE_SECONDS,
      refresh_token: refreshToken,
      scope,
      ...(parseScopes(scope).includes('openid')
        ? { id_token: await this.identity.createIdToken(userId, clientId) }
        : {}),
    };
  }

  private require(value: unknown, message: string): asserts value {
    if (!value) throw new OAuthException(message, 400);
  }

  private verifyPkce(verifier: string, challenge: string) {
    return (
      createHash('sha256').update(verifier).digest('base64url') === challenge
    );
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private generateToken() {
    return randomBytes(32).toString('base64url');
  }

  private sessionExpiration() {
    return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  }

  private string(value: unknown) {
    return typeof value === 'string' ? value : null;
  }
}
