import type { Request, Response } from 'express';
import type { DiscordAccessToken, OAuthContext } from './auth.types';

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) {
      return decodeURIComponent(item.slice(separator + 1));
    }
  }
  return null;
}

function readJsonCookie<T>(request: Request, name: string): T | null {
  const value = readCookie(request, name);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getOAuthContext(request: Request): OAuthContext | null {
  const value = readJsonCookie<OAuthContext>(request, 'oauth_ctx');
  return value && typeof value.discord_state === 'string' ? value : null;
}

export function getDiscordAccess(request: Request): DiscordAccessToken | null {
  const value = readJsonCookie<DiscordAccessToken>(request, 'discord_access');
  return value && typeof value.access_token === 'string' ? value : null;
}

export function cookieOptions(production: boolean, sameSite: 'lax' | 'strict') {
  return {
    httpOnly: true,
    secure: production,
    sameSite,
    path: '/',
  } as const;
}

export function clearOAuthContext(response: Response) {
  response.clearCookie('oauth_ctx', { path: '/' });
}
