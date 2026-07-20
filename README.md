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
