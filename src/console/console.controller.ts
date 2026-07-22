import { Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { IdentityService } from '../auth/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

@Controller('console')
export class ConsoleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    config: ConfigService,
  ) {
    this.apiUrl = config.getOrThrow<string>('API_URL');
  }
  private readonly apiUrl: string;

  @Get('login')
  login(@Res() response: Response) {
    const verifier = randomBytes(32).toString('base64url');
    const state = randomUUID();
    response.cookie('console-oauth', JSON.stringify({ verifier, state }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 600000,
      path: '/console/login',
    });
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: 'api-panel',
      redirect_uri: new URL('/console/login/callback', this.apiUrl).toString(),
      scope: 'openid identify',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    return response.redirect(`/oauth/authorize?${query}`);
  }

  @Get('login/callback')
  async loginCallback(@Req() request: Request, @Res() response: Response) {
    const context = readCookie(request, 'console-oauth');
    const code =
      typeof request.query.code === 'string' ? request.query.code : null;
    const state =
      typeof request.query.state === 'string' ? request.query.state : null;
    if (!context || !code || !state) return response.redirect('/console/login');
    try {
      const parsed = JSON.parse(context) as {
        verifier?: string;
        state?: string;
      };
      if (parsed.state !== state || !parsed.verifier)
        return response.redirect('/console/login');
      const token = await fetch(new URL('/oauth/token', this.apiUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: 'api-panel',
          code,
          code_verifier: parsed.verifier,
          redirect_uri: new URL(
            '/console/login/callback',
            this.apiUrl,
          ).toString(),
        }),
      });
      if (!token.ok) return response.redirect('/console/login');
      response.cookie('console-session', JSON.stringify(await token.json()), {
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        path: '/console',
      });
      return response.redirect('/console');
    } catch {
      return response.redirect('/console/login');
    }
  }

  @Get()
  async index(@Req() request: Request, @Res() response: Response) {
    const user = await this.user(request);
    if (!user) return response.redirect('/console/login');
    return response
      .type('html')
      .send(
        '<h1>Herramientas de Consola</h1><nav><a href="/console/mods">Upload SMP Mods</a> · <a href="/console/roles">Manage Roles</a></nav>',
      );
  }

  @Get('mods')
  async mods(@Req() request: Request, @Res() response: Response) {
    if (!(await this.user(request))) return response.redirect('/console/login');
    return response
      .type('html')
      .send(
        '<h1>Subir Nuevo Modpack</h1><form method="post" enctype="multipart/form-data"><input type="file" name="file" accept=".rar" required><button>Subir Archivo</button></form><a href="/console">Volver</a>',
      );
  }

  @Post('mods')
  async upload(@Req() request: Request, @Res() response: Response) {
    if (!(await this.user(request))) return response.redirect('/console/login');
    return response.status(501).json({
      error:
        'La carga de modpacks se habilitará con el módulo S3 de administración.',
    });
  }

  @Get('roles')
  async roles(@Req() request: Request, @Res() response: Response) {
    if (!(await this.user(request))) return response.redirect('/console/login');
    const roles = await this.prisma.client.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return response
      .type('html')
      .send(
        `<h1>Manage Roles</h1><ul>${roles.map((role) => `<li><a href="/console/roles/${role.id}">${escapeHtml(role.name)}</a></li>`).join('')}</ul><a href="/console">Volver</a>`,
      );
  }

  @Get('roles/:id')
  async role(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (!(await this.user(request))) return response.redirect('/console/login');
    const role = await this.prisma.client.role.findUnique({
      where: { id },
      select: { id: true, name: true, permissions: true },
    });
    if (!role)
      return response
        .status(404)
        .type('html')
        .send('<h1>404</h1><p>El rol no existe.</p>');
    return response
      .type('html')
      .send(
        `<h1>Administrar rol ${escapeHtml(role.name)}</h1><p>Permisos: ${role.permissions}</p><a href="/console/roles">Volver</a>`,
      );
  }

  private async user(request: Request) {
    const raw = readCookie(request, 'console-session');
    if (!raw) return null;
    try {
      const session = JSON.parse(String(raw)) as { access_token?: string };
      if (!session.access_token) return null;
      const verified = await this.identity.verifyAccessToken(
        session.access_token,
      );
      if (!verified) return null;
      return verified.payload.sub;
    } catch {
      return null;
    }
  }
}

function readCookie(request: Request, name: string) {
  const header = request.headers.cookie;
  if (!header) return null;
  const item = header
    .split(';')
    .find((part) => part.trim().startsWith(`${name}=`));
  return item ? decodeURIComponent(item.trim().slice(name.length + 1)) : null;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  );
}
