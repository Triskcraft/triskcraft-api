# Triskcraft API

Independent NestJS service that will host Triskcraft's public API, OAuth/SSO,
internal webhooks, temporary administration console and S3 file access.

This repository is the foundation described in
[Triskcraft/Triskcraft#5](https://github.com/Triskcraft/Triskcraft/issues/5).
The endpoint migrations remain separate follow-up work.

## Requirements

- Node.js 24.14 or newer
- pnpm 11.15.0 (declared through Corepack)
- PostgreSQL connection string

```powershell
Copy-Item .env.example .env
corepack pnpm install
corepack pnpm start:dev
```

The health check is available at `GET /health` and Swagger at `/docs`.

## Configuration

The API validates its environment during startup. `DATABASE_URL` is required
and must use the `postgres://` or `postgresql://` scheme. `PORT` defaults to
`3000` and `NODE_ENV` defaults to `development`.

Only API-owned settings belong here. Identity signing keys, session secrets,
webhook HMAC secrets and Discord credentials must remain separate values. Do
not copy the bot's complete environment file or use a generic shared
`JWT_SECRET`.

### OAuth / SSO

The `AuthModule` exposes the compatible OAuth endpoints under `/oauth` and
supports authorization code grants with PKCE S256, Discord login, access and
ID tokens, refresh-token rotation and scope-filtered identity responses.

Identity tokens use the dedicated `IDENTITY_PRIVATE_KEY` and
`IDENTITY_PUBLIC_KEY` RSA pair. `IDENTITY_KEY_ID` is written as `kid` so the
pair can later be exposed through JWKS and rotated. Browser sessions use the
independent `SESSION_SECRET`; webhook and Discord credentials must never reuse
either identity or session key material.

The supported scopes are `openid`, `identify` and `minecraft`. OAuth clients,
redirect URIs and their allowed scopes continue to be managed in PostgreSQL.
Discord OAuth uses its own client credentials and `DISCORD_REST_TOKEN` only for
joining an authenticated user to the configured guild when necessary.

### Signed webhooks

The internal endpoints `/webhooks/digs`, `/webhooks/link` and
`/webhooks/join` require a service JWT with the route-specific permission and
the following headers:

```text
Authorization: Bearer <service-jwt>
X-Timestamp: <unix-seconds>
X-Signature: <sha256-hmac-hex>
```

The signature is calculated over the exact UTF-8 request bytes, without
re-serializing JSON:

```text
HMAC_SHA256(webhook-secret, timestamp + "." + rawBody)
```

Requests outside the existing 15-second timestamp window are rejected. The
per-token webhook secrets remain encrypted in PostgreSQL; the API decrypts
them with the independent `WEBHOOK_ENCRYPTION_KEY`. No secret values are
included in this documentation.

`/webhooks/digs` is processed through an in-memory NestJS provider every second.
Updates for the same player are coalesced to the latest value, reducing the
write frequency while keeping the batching window short. Drains are serialized
so overlapping scheduler invocations cannot apply stale values after newer
ones.

This queue is intentionally not persistent yet. The webhook returns `200` once
the payload is accepted into the process-local queue, not once the database
write completes. On Vercel, an invocation can be frozen or recycled after the
response, so events still in memory may be lost. A durable outbox/job table is
required if webhook delivery must survive process termination; the provider
can be replaced with that implementation without changing the controller.

### Temporary administration console

The existing administrative interface is available under `/console`. It keeps
the OAuth/PKCE login, permission checks, modpack upload and role-management
operations from the former Express runtime. The HTML layout and components are
kept intentionally simple and compatible; this is a temporary home for the
console, which should later be extracted into an independent administration
application instead of being redesigned inside the API.

### S3 files

`GET /files/:bucket/:filename` streams objects from the configured S3-compatible
service and preserves the existing download headers. The public aliases remain
`web` (`public-web`) and `blog` (`blog-media`). The console uploads the SMP
modpack to `public-web/pack-mods-triskcraftsmp.rar` using multipart streaming.

## Database ownership

The service consumes the generated Prisma Client from `@triskcraft/db` through
the global `PrismaModule`. It intentionally contains no Prisma schema or
migrations. Database migrations are run only by the database repository's
dedicated production workflow and never during API startup or deployment.

## Commands

- `pnpm start:dev`: local development server
- `pnpm build`: compile the NestJS application
- `pnpm lint`: lint without modifying files
- `pnpm format`: format source files
- `pnpm test`: unit tests
- `pnpm test:e2e`: HTTP integration tests
- `pnpm verify`: final formatting, lint, test and build gate

## Deployment

Vercel's Git integration is not used. A push to `main` runs
`.github/workflows/deploy.yml`, verifies the project, builds with Vercel and
deploys the prebuilt output to production. The GitHub `production` environment
contains `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`; runtime values
such as `DATABASE_URL` are managed in the Vercel project.
