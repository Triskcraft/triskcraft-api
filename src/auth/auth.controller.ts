import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { OAuthTokenRequest } from '@triskcraft/api-types';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { DiscordOAuthService } from './discord-oauth.service';
import {
  clearOAuthContext,
  cookieOptions,
  getDiscordAccess,
  getOAuthContext,
} from './oauth-cookies';
import { oauthErrorHtml } from './oauth-html';

@ApiTags('OAuth / SSO')
@Controller('oauth')
export class AuthController {
  private readonly production: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly discord: DiscordOAuthService,
    config: ConfigService,
  ) {
    this.production = config.get<string>('NODE_ENV') === 'production';
  }

  @Get('authorize')
  @ApiOperation({ summary: 'Start or continue an OAuth authorization flow' })
  @ApiFoundResponse({
    description: 'Discord login or client callback redirect',
  })
  @ApiBadRequestResponse({
    description: 'Browser-facing OAuth validation page',
  })
  async authorize(
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    let authorization: Awaited<
      ReturnType<AuthService['validateAuthorizationRequest']>
    >;
    try {
      authorization = await this.auth.validateAuthorizationRequest(query);
    } catch (error) {
      response.send(
        oauthErrorHtml(
          error instanceof Error ? error.message : 'Invalid request.',
        ),
      );
      return;
    }

    let discordAccess = getDiscordAccess(request);
    if (discordAccess && this.discordTokenNeedsRefresh(discordAccess)) {
      const refreshed = await this.discord.refreshToken(
        discordAccess.refresh_token,
      );
      if (refreshed) {
        discordAccess = { ...refreshed, issued_at: Date.now() };
        response.cookie('discord_access', JSON.stringify(discordAccess), {
          ...cookieOptions(this.production, 'lax'),
          maxAge: discordAccess.expires_in * 1000,
        });
      } else {
        discordAccess = null;
      }
    }
    if (!discordAccess) {
      this.redirectToDiscord(query, response);
      return;
    }

    const discordUser = await this.discord.getUser(discordAccess.access_token);
    if (
      !discordUser ||
      !(await this.discord.ensureGuildMembership(
        discordAccess.access_token,
        discordUser.id,
      ))
    ) {
      this.redirectToDiscord(query, response);
      return;
    }

    try {
      const result = await this.auth.completeAuthorization(
        authorization,
        discordAccess,
      );
      response.cookie(
        'session',
        result.session,
        cookieOptions(this.production, 'strict'),
      );
      const callback = new URL(authorization.redirectUri);
      callback.searchParams.set('code', result.code);
      if (authorization.state) {
        callback.searchParams.set('state', authorization.state);
      }
      response.redirect(callback.toString());
    } catch (error) {
      response
        .status(500)
        .send(
          oauthErrorHtml(
            error instanceof Error ? error.message : 'Authorization failed.',
            'Authorization failed',
            500,
          ),
        );
    }
  }

  @Get('discord')
  @ApiOperation({ summary: 'Handle the Discord OAuth callback' })
  @ApiFoundResponse({ description: 'Returns to the authorization endpoint' })
  async discordCallback(
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (typeof code !== 'string') {
      response.redirect('/oauth/authorize');
      return;
    }
    const context = getOAuthContext(request);
    if (
      !context ||
      typeof state !== 'string' ||
      context.discord_state !== state
    ) {
      clearOAuthContext(response);
      response.send(
        oauthErrorHtml(
          'Invalid OAuth context. Please try again.',
          'Invalid Request',
        ),
      );
      return;
    }

    const token = await this.discord.exchangeCode(code);
    if (!token) {
      response.send(
        oauthErrorHtml(
          'Discord rejected the authorization code. Please try again.',
          'Discord Login Failed',
        ),
      );
      return;
    }
    const user = await this.discord.getUser(token.access_token);
    if (
      !user ||
      !(await this.discord.ensureGuildMembership(token.access_token, user.id))
    ) {
      response.send(
        oauthErrorHtml(
          'Discord could not complete the server login. Please try again.',
          'Discord Login Failed',
        ),
      );
      return;
    }

    response.cookie(
      'discord_access',
      JSON.stringify({ ...token, issued_at: Date.now() }),
      {
        ...cookieOptions(this.production, 'lax'),
        maxAge: token.expires_in * 1000,
      },
    );
    const oauthParams: Record<string, string> = { ...context };
    delete oauthParams.discord_state;
    clearOAuthContext(response);
    response.redirect(`/oauth/authorize?${new URLSearchParams(oauthParams)}`);
  }

  @Post('token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange an authorization code using PKCE' })
  @ApiBody({ description: 'OAuth authorization_code grant' })
  @ApiOkResponse({ description: 'Access, refresh and optional ID token' })
  @ApiBadRequestResponse({
    description: 'Invalid grant, code or PKCE verifier',
  })
  token(@Body() body: Partial<OAuthTokenRequest>) {
    return this.auth.exchangeAuthorizationCode(body);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token and issue new tokens' })
  @ApiOkResponse({ description: 'Rotated refresh token and new access token' })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired or reused token' })
  refresh(@Body() body: Record<string, unknown>) {
    return this.auth.refresh(body);
  }

  @Post('me')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return identity claims allowed by token scopes' })
  @ApiOkResponse({ description: 'Scope-filtered user information' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  me(@Headers('authorization') authorization?: string) {
    return this.auth.me(authorization);
  }

  private redirectToDiscord(
    query: Record<string, unknown>,
    response: Response,
  ) {
    const discordState = randomBytes(32).toString('base64url');
    const context: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') context[key] = value;
    }
    context.discord_state = discordState;
    response.cookie('oauth_ctx', JSON.stringify(context), {
      ...cookieOptions(this.production, 'lax'),
      maxAge: 10 * 60 * 1000,
    });
    response.redirect(this.discord.authorizationUrl(discordState));
  }

  private discordTokenNeedsRefresh(token: {
    expires_in: number;
    issued_at?: number;
  }) {
    if (!token.issued_at) return false;
    return Date.now() >= token.issued_at + token.expires_in * 1000 - 60_000;
  }
}
