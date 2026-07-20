export const OAUTH_SCOPES = ['openid', 'identify', 'minecraft'] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export interface DiscordAccessToken {
  token_type: 'Bearer';
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  issued_at?: number;
}

export interface DiscordUser {
  id: string;
  username: string;
}

export interface OAuthContext {
  discord_state: string;
  [key: string]: string;
}

export interface AccessTokenClaims {
  sub: string;
  session_id: string;
  client_id: string;
  aud: string;
  scope: string;
}

export function parseScopes(scope: unknown): OAuthScope[] {
  if (typeof scope !== 'string') return [];
  const requested = new Set(
    scope
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return OAUTH_SCOPES.filter((item) => requested.has(item));
}

export function serializeScopes(scopes: readonly OAuthScope[]) {
  return scopes.join(' ');
}
