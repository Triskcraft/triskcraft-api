import { Injectable } from '@nestjs/common';
import {
  PrismaClientKnownRequestError,
  STATE_KEYS,
  type Role,
} from '@triskcraft/db';
import type { Request } from 'express';
import { IdentityService } from '../auth/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import { readCookie } from './cookies';
import { Permissions, PermissionsFlagsBits } from './permissions';
import type { FormAction } from './role-components';

export interface ConsoleSession {
  userId: string;
  permissions: bigint;
}

export class ConsoleActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class ConsoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  async session(
    request: Request,
    bits: bigint,
    anyBits = false,
  ): Promise<ConsoleSession | null | 'forbidden'> {
    const raw = readCookie(request, 'console-session');
    if (!raw) return null;
    try {
      const token = JSON.parse(raw) as { access_token?: string };
      if (!token.access_token) return null;
      const verified = await this.identity.verifyAccessToken(
        token.access_token,
      );
      if (!verified) return null;
      const oauthSession = await this.prisma.client.session.findUnique({
        where: { id: verified.payload.session_id },
        select: {
          expires_at: true,
          user_id: true,
          user: {
            select: {
              linked_roles: {
                select: { role: { select: { permissions: true } } },
              },
            },
          },
        },
      });
      if (
        !oauthSession ||
        oauthSession.user_id !== verified.payload.sub ||
        oauthSession.expires_at < new Date()
      )
        return null;
      const permissions = oauthSession.user.linked_roles.reduce(
        (value, item) => value | item.role.permissions,
        0n,
      );
      const grants = new Permissions(permissions);
      if (
        !grants.has(PermissionsFlagsBits.ADMIN) &&
        !(anyBits ? grants.any(bits) : grants.has(bits))
      )
        return 'forbidden';
      return { userId: oauthSession.user_id, permissions };
    } catch {
      return null;
    }
  }

  async ensureConsoleClient(callback: string) {
    const client = await this.prisma.client.client.findUnique({
      where: { id: 'api-panel' },
      select: { redirect_uris: true },
    });
    if (!client) return false;
    if (!client.redirect_uris.includes(callback)) {
      await this.prisma.client.client.update({
        where: { id: 'api-panel' },
        data: { redirect_uris: [...client.redirect_uris, callback] },
      });
    }
    return true;
  }

  async firstRoleId() {
    return (await this.prisma.client.role.findFirst({ select: { id: true } }))
      ?.id;
  }

  async roleData(id: string) {
    const role = await this.prisma.client.role.findUnique({ where: { id } });
    if (!role) return null;
    const [roles, users, defaultRole, systemRole] = await Promise.all([
      this.prisma.client.role.findMany({ select: { id: true, name: true } }),
      this.prisma.client.discordUser.findMany({
        where: { user: { linked_roles: { some: { role_id: id } } } },
        select: { id: true, username: true },
      }),
      this.state(STATE_KEYS.DEFAULT_ROLE_ID),
      this.state(STATE_KEYS.SUPER_ROLE_ID),
    ]);
    return {
      role,
      roles,
      users,
      defaultRoleId: defaultRole,
      systemRoleId: systemRole,
    };
  }

  async perform(
    action: FormAction,
    role: Role,
    body: Record<string, unknown>,
    session: ConsoleSession,
  ) {
    const value = typeof body.id === 'string' ? body.id.trim() : '';
    switch (action) {
      case 'addusr':
        return this.addUser(role, value);
      case 'rmusr':
        return this.removeUser(role, value);
      case 'addrole':
        return this.createRole(value);
      case 'chname':
        return this.renameRole(role, value);
      case 'setdefault':
        return this.setDefault(role);
      case 'chperm':
        return this.changePermissions(role, body, session);
    }
  }

  async deleteRole(role: Role) {
    await this.assertDeletable(role);
    await this.prisma.client.$transaction([
      this.prisma.client.linkedRole.deleteMany({ where: { role_id: role.id } }),
      this.prisma.client.role.delete({ where: { id: role.id } }),
    ]);
    void this.assignDefaultRoleToUsersWithoutRoles().catch((error: unknown) => {
      console.error('Error assigning the default role', error);
    });
  }

  async assertDeletable(role: Role) {
    await this.assertNotSystem(role);
    if ((await this.state(STATE_KEYS.DEFAULT_ROLE_ID)) === role.id)
      throw new ConsoleActionError(
        409,
        'Establece otro rol como Default antes de eliminar este rol.',
      );
  }

  private state(key: string) {
    return this.prisma.client.state
      .findUnique({ where: { key }, select: { value: true } })
      .then((state) => state?.value);
  }

  private async addUser(role: Role, discordId: string) {
    const user = await this.prisma.client.user.findFirst({
      where: { discord_user_id: discordId },
      select: { id: true },
    });
    if (!user)
      throw new ConsoleActionError(
        404,
        'No se encontró el usuario. Puede que no haya iniciado sesión en triskcraft.com.',
      );
    await this.prisma.client.linkedRole.upsert({
      where: { user_id_role_id: { role_id: role.id, user_id: user.id } },
      create: { role_id: role.id, user_id: user.id },
      update: {},
    });
  }

  private async removeUser(role: Role, discordId: string) {
    if (
      (await this.prisma.client.linkedRole.count({
        where: { role_id: role.id },
      })) < 2
    )
      throw new ConsoleActionError(
        403,
        'No se puede quitar el último usuario de este rol.',
      );
    const user = await this.prisma.client.user.findFirst({
      where: { discord_user_id: discordId },
      select: { id: true },
    });
    if (!user) throw new ConsoleActionError(404, 'No se encontró el usuario.');
    await this.prisma.client.linkedRole.deleteMany({
      where: { role_id: role.id, user_id: user.id },
    });
  }

  private async createRole(name: string) {
    if (!name || name.length > 64)
      throw new ConsoleActionError(
        400,
        'El nombre debe tener entre 1 y 64 caracteres.',
      );
    try {
      return await this.prisma.client.role.create({ data: { name } });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  private async renameRole(role: Role, name: string) {
    await this.assertNotSystem(role);
    if (!name || name.length > 64)
      throw new ConsoleActionError(
        400,
        'El nombre debe tener entre 1 y 64 caracteres.',
      );
    try {
      await this.prisma.client.role.update({
        where: { id: role.id },
        data: { name },
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  private async setDefault(role: Role) {
    if ((await this.state(STATE_KEYS.SUPER_ROLE_ID)) === role.id)
      throw new ConsoleActionError(400, 'Super no puede ser el rol Default.');
    await this.prisma.client.state.upsert({
      where: { key: STATE_KEYS.DEFAULT_ROLE_ID },
      create: { key: STATE_KEYS.DEFAULT_ROLE_ID, value: role.id },
      update: { value: role.id },
    });
  }

  private async changePermissions(
    role: Role,
    body: Record<string, unknown>,
    session: ConsoleSession,
  ) {
    await this.assertNotSystem(role);
    const names = Object.keys(body);
    const systemRoleId = await this.state(STATE_KEYS.SUPER_ROLE_ID);
    const sessionUserIsSuper = systemRoleId
      ? await this.prisma.client.linkedRole.findUnique({
          where: {
            user_id_role_id: {
              user_id: session.userId,
              role_id: systemRoleId,
            },
          },
        })
      : null;
    if (!sessionUserIsSuper) {
      const index = names.indexOf('ADMIN');
      if (index >= 0) names.splice(index, 1);
    }
    await this.prisma.client.role.update({
      where: { id: role.id },
      data: { permissions: new Permissions(names).bitfield },
    });
  }

  private async assignDefaultRoleToUsersWithoutRoles() {
    const roleId = await this.state(STATE_KEYS.DEFAULT_ROLE_ID);
    if (!roleId) return;
    const users = await this.prisma.client.user.findMany({
      where: { linked_roles: { none: {} } },
      select: { id: true },
    });
    if (users.length)
      await this.prisma.client.linkedRole.createMany({
        data: users.map(({ id }) => ({ user_id: id, role_id: roleId })),
        skipDuplicates: true,
      });
  }

  private async assertNotSystem(role: Role) {
    if ((await this.state(STATE_KEYS.SUPER_ROLE_ID)) === role.id)
      throw new ConsoleActionError(
        403,
        'El rol Super es administrado por el sistema y no puede modificarse ni eliminarse.',
      );
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConsoleActionError(
        400,
        'Ese rol ya existe. Intenta con otro nombre.',
      );
    throw error;
  }
}
