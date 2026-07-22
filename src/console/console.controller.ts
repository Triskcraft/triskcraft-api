import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { FilesService } from '../files/files.service';
import { AnchorButton, Button, ErrorCard, Layout } from './components';
import {
  ConsoleActionError,
  ConsoleService,
  type ConsoleSession,
} from './console.service';
import { readCookie } from './cookies';
import { html } from './html';
import { PermissionsFlagsBits } from './permissions';
import {
  DeleteRoleForm,
  FORM_ACTIONS,
  RolePanel,
  type FormAction,
} from './role-components';

@ApiTags('Temporary administration console')
@Controller('console')
export class ConsoleController {
  private readonly apiUrl: string;
  private readonly consoleLoginBaseUrl: string;
  private readonly production: boolean;

  constructor(
    private readonly consoleService: ConsoleService,
    private readonly files: FilesService,
    config: ConfigService,
  ) {
    this.apiUrl = config.getOrThrow<string>('API_URL');
    this.consoleLoginBaseUrl =
      config.get<string>('CONSOLE_LOGIN_REDIRECT') ?? this.apiUrl;
    this.production = config.get<string>('NODE_ENV') === 'production';
  }

  @Get('login')
  async login(@Res() response: Response) {
    const callback = this.callbackUrl();
    if (!(await this.consoleService.ensureConsoleClient(callback))) {
      return this.error(
        response,
        400,
        'El cliente OAuth de la consola no está configurado.',
        '/console/login',
      );
    }
    const verifier = randomBytes(32).toString('base64url');
    const state = randomUUID();
    response.cookie('console-oauth', JSON.stringify({ verifier, state }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.production,
      maxAge: 600_000,
      path: '/console/login',
    });
    const loginUrl = `/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: 'api-panel',
      redirect_uri: callback,
      scope: 'openid identify',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    })}`;
    return response.type('html').send(
      Layout({
        title: 'Acceso a la consola',
        children: html`<main class="container">
            <section class="login-panel">
              <p class="login-label">Consola administrativa</p>
              <h1>Acceso restringido</h1>
              <p class="login-message">
                Estás entrando a una consola exclusiva para personal autorizado
                de Triskcraft.
              </p>
              ${AnchorButton({ href: loginUrl, children: 'Iniciar sesión con Discord', className: 'login-button' })}
            </section>
          </main>
          <style>
            .login-panel {
              background: #fff;
              border: 1px solid #d9dce3;
              border-top: 5px solid #5865f2;
              border-radius: 8px;
              box-shadow: 0 12px 32px rgba(31, 35, 48, 0.12);
              padding: 36px 30px;
            }
            .login-label {
              color: #5865f2;
              font-size: 0.8rem;
              font-weight: 700;
              margin: 0 0 8px;
              text-transform: uppercase;
            }
            .login-message {
              color: #5d6270;
              line-height: 1.6;
              margin: 0 0 28px;
            }
            .login-button {
              display: block;
              width: 100%;
            }
          </style>`,
      }),
    );
  }

  @Get('login/callback')
  async loginCallback(@Req() request: Request, @Res() response: Response) {
    const raw = readCookie(request, 'console-oauth');
    const code =
      typeof request.query.code === 'string' ? request.query.code : null;
    const state =
      typeof request.query.state === 'string' ? request.query.state : null;
    response.clearCookie('console-oauth', { path: '/console/login' });
    if (!raw || !code || !state)
      return this.error(
        response,
        400,
        'El contexto de inicio de sesión no es válido o expiró.',
        '/console/login',
      );
    try {
      const context = JSON.parse(raw) as { verifier?: string; state?: string };
      if (!context.verifier || context.state !== state)
        throw new Error('Invalid OAuth context');
      const token = await fetch(new URL('/oauth/token', this.apiUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: 'api-panel',
          redirect_uri: this.callbackUrl(),
          code_verifier: context.verifier,
          code,
        }),
      });
      if (!token.ok) throw new Error('Token exchange failed');
      response.cookie('console-session', JSON.stringify(await token.json()), {
        httpOnly: true,
        secure: this.production,
        sameSite: 'lax',
        path: '/console',
      });
      return response.redirect('/console');
    } catch {
      return this.error(
        response,
        400,
        'No se pudo completar el inicio de sesión. Inténtalo de nuevo.',
        '/console/login',
      );
    }
  }

  @Get()
  async index(@Req() request: Request, @Res() response: Response) {
    const session = await this.authorize(
      request,
      response,
      PermissionsFlagsBits.MANAGE_MODPACK | PermissionsFlagsBits.MANAGE_ROLES,
      true,
    );
    if (!session) return;
    return response.type('html').send(
      Layout({
        children: html`<div class="container">
          <h1>Herramientas de Consola</h1>
          <nav class="menu-links">
            ${AnchorButton({ href: '/console/mods', children: 'Upload SMP Mods' })}${AnchorButton({ href: '/console/roles', children: 'Manage Roles' })}
          </nav>
        </div>`,
      }),
    );
  }

  @Get('mods')
  async mods(@Req() request: Request, @Res() response: Response) {
    if (
      !(await this.authorize(
        request,
        response,
        PermissionsFlagsBits.MANAGE_MODPACK,
      ))
    )
      return;
    return response.type('html').send(Layout({ children: this.modsForm() }));
  }

  @Post('mods')
  async uploadMods(@Req() request: Request, @Res() response: Response) {
    if (
      !(await this.authorize(
        request,
        response,
        PermissionsFlagsBits.MANAGE_MODPACK,
      ))
    )
      return;
    await this.files.uploadModpack(request);
    return response.json({ ok: true });
  }

  @Get('roles')
  async roles(@Req() request: Request, @Res() response: Response) {
    if (
      !(await this.authorize(
        request,
        response,
        PermissionsFlagsBits.MANAGE_ROLES,
      ))
    )
      return;
    const id = await this.consoleService.firstRoleId();
    return id
      ? response.redirect(`/console/roles/${id}`)
      : this.error(response, 404, 'No existen roles configurados.', '/console');
  }

  @Get('roles/:id')
  async role(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (
      !(await this.authorize(
        request,
        response,
        PermissionsFlagsBits.MANAGE_ROLES,
      ))
    )
      return;
    const data = await this.consoleService.roleData(id);
    if (!data)
      return this.error(
        response,
        404,
        'El rol que buscas no existe.',
        '/console/roles',
      );
    return response.type('html').send(
      Layout({
        title: `Administrar rol ${data.role.name}`,
        children: RolePanel(data),
      }),
    );
  }

  @Post('roles/:id')
  async updateRole(
    @Param('id') id: string,
    @Query('ac') action: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const session = await this.authorize(
      request,
      response,
      PermissionsFlagsBits.MANAGE_ROLES,
    );
    if (!session) return;
    if (!Object.values(FORM_ACTIONS).includes(action as FormAction))
      return this.error(
        response,
        400,
        'La acción solicitada no existe o está incompleta.',
        `/console/roles/${id}`,
      );
    const data = await this.consoleService.roleData(id);
    if (!data)
      return this.error(
        response,
        404,
        'El rol que buscas no existe.',
        '/console/roles',
      );
    try {
      const created = await this.consoleService.perform(
        action as FormAction,
        data.role,
        body,
        session,
      );
      if (created && 'id' in created)
        return response.redirect(`/console/roles/${created.id}`);
      if (action === FORM_ACTIONS.SETDEFAULT)
        return response.redirect(`/console/roles/${id}`);
      const updated = await this.consoleService.roleData(id);
      if (!updated)
        return this.error(
          response,
          404,
          'El rol que buscas no existe.',
          '/console/roles',
        );
      return response.type('html').send(
        Layout({
          title: `Administrar rol ${updated.role.name}`,
          children: RolePanel(updated),
        }),
      );
    } catch (error) {
      return this.actionError(response, error, `/console/roles/${id}`);
    }
  }

  @Get('roles/:id/delete')
  async deleteConfirmation(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (
      !(await this.authorize(
        request,
        response,
        PermissionsFlagsBits.MANAGE_ROLES,
      ))
    )
      return;
    const data = await this.consoleService.roleData(id);
    if (!data)
      return this.error(
        response,
        404,
        'El rol que buscas no existe.',
        '/console/roles',
      );
    try {
      await this.consoleService.assertDeletable(data.role);
      return response.type('html').send(
        Layout({
          title: `Eliminar rol ${data.role.name}`,
          children: DeleteRoleForm(data.role),
        }),
      );
    } catch (error) {
      return this.actionError(response, error, `/console/roles/${id}`);
    }
  }

  @Post('roles/:id/delete')
  async deleteRole(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (
      !(await this.authorize(
        request,
        response,
        PermissionsFlagsBits.MANAGE_ROLES,
      ))
    )
      return;
    const data = await this.consoleService.roleData(id);
    if (!data)
      return this.error(
        response,
        404,
        'El rol que buscas no existe.',
        '/console/roles',
      );
    try {
      await this.consoleService.deleteRole(data.role);
      return response.redirect('/console/roles');
    } catch (error) {
      return this.actionError(response, error, `/console/roles/${id}`);
    }
  }

  private async authorize(
    request: Request,
    response: Response,
    bits: bigint,
    anyBits = false,
  ): Promise<ConsoleSession | null> {
    const session = await this.consoleService.session(request, bits, anyBits);
    if (!session) {
      response.clearCookie('console-session', { path: '/console' });
      response.redirect('/console/login');
      return null;
    }
    if (session === 'forbidden') {
      response.status(403).json({ error: 'Forbidden' });
      return null;
    }
    return session;
  }

  private actionError(response: Response, error: unknown, backUrl: string) {
    if (error instanceof ConsoleActionError)
      return this.error(response, error.status, error.message, backUrl);
    return this.error(response, 500, 'Intenta más tarde.', backUrl);
  }

  private error(
    response: Response,
    status: number,
    message: string,
    backUrl: string,
  ) {
    return response
      .status(status)
      .type('html')
      .send(
        Layout({
          title: String(status),
          children: ErrorCard({ code: status, message, backUrl }),
        }),
      );
  }

  private callbackUrl() {
    return new URL(
      '/console/login/callback',
      this.consoleLoginBaseUrl,
    ).toString();
  }

  private modsForm() {
    return html`<div class="upload-component-wrapper">
        <style>
          .upload-component-wrapper {
            max-width: 400px;
            background: #fff;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
          }
          .file-input-group {
            margin: 20px 0;
            text-align: left;
          }
          input[type='file'] {
            width: 100%;
            padding: 10px;
            border: 1px dashed #ccc;
            border-radius: 6px;
            box-sizing: border-box;
          }
          .upload-button {
            width: 100%;
          }
          .back-link {
            display: block;
            margin-top: 15px;
            text-decoration: none;
            color: #007bff;
            font-size: 13px;
          }
          .progress-area {
            display: none;
            margin-top: 20px;
          }
          .progress-bar-bg {
            width: 100%;
            height: 10px;
            background: #edf2f7;
            border-radius: 10px;
            overflow: hidden;
            margin-top: 8px;
          }
          .progress-bar-fill {
            height: 100%;
            width: 0;
            background: #48bb78;
          }
          .status-info {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: #4a5568;
          }
        </style>
        <h2>Subir Nuevo Modpack</h2>
        <p>Selecciona tu archivo <strong>.rar</strong> para procesarlo.</p>
        <form id="uploadForm">
          <div class="file-input-group">
            <input
              id="modFile"
              type="file"
              name="mods"
              accept=".rar"
              required
            />
          </div>
          ${Button({ type: 'submit', id: 'uploadBtn', className: 'upload-button', children: 'Subir Archivo' })}
        </form>
        <a href="/console" class="back-link">← Volver al menú</a>
        <div id="progressArea" class="progress-area">
          <div class="status-info">
            <span id="statusText">Subiendo...</span
            ><span id="percentText">0%</span>
          </div>
          <div class="progress-bar-bg">
            <div id="progressBar" class="progress-bar-fill"></div>
          </div>
        </div>
      </div>
      <script>
        const form = document.getElementById('uploadForm'),
          input = document.getElementById('modFile'),
          area = document.getElementById('progressArea'),
          bar = document.getElementById('progressBar'),
          percent = document.getElementById('percentText'),
          status = document.getElementById('statusText'),
          button = document.getElementById('uploadBtn');
        form.onsubmit = (e) => {
          e.preventDefault();
          if (!input.files.length) return;
          const data = new FormData();
          data.append('file', input.files[0]);
          const xhr = new XMLHttpRequest();
          area.style.display = 'block';
          button.disabled = true;
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const value = Math.round((e.loaded / e.total) * 100);
              bar.style.width = value + '%';
              percent.innerText = value + '%';
            }
          };
          xhr.onload = () => {
            button.disabled = false;
            if (xhr.status === 200) {
              status.innerText = '¡Completado con éxito!';
              bar.style.background = '#2ecc71';
              form.reset();
            } else {
              status.innerText = 'Error al subir.';
              bar.style.background = '#e53e3e';
            }
          };
          xhr.open('POST', '/console/mods');
          xhr.send(data);
        };
      </script>`;
  }
}
