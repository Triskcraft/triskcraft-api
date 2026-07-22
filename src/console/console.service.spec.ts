jest.mock(
  '@triskcraft/db',
  () => ({
    STATE_KEYS: {
      SUPER_ROLE_ID: 'SUPER_ROLE_ID',
      DEFAULT_ROLE_ID: 'DEFAULT_ROLE_ID',
    },
    PrismaClientKnownRequestError: class extends Error {},
  }),
  { virtual: true },
);
jest.mock('../auth/identity.service', () => ({
  IdentityService: class {},
}));

import type { Role } from '@triskcraft/db';
import type { IdentityService } from '../auth/identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ConsoleActionError, ConsoleService } from './console.service';

const role: Role = { id: 'role-1', name: 'Staff', permissions: 0n };
const STATE_KEYS = {
  SUPER_ROLE_ID: 'SUPER_ROLE_ID',
  DEFAULT_ROLE_ID: 'DEFAULT_ROLE_ID',
} as const;

describe('ConsoleService', () => {
  it('only lets members of the system role grant ADMIN', async () => {
    const update = jest.fn().mockResolvedValue(role);
    const prisma = {
      client: {
        state: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { key: string } }) =>
              Promise.resolve({
                value:
                  where.key === STATE_KEYS.SUPER_ROLE_ID ? 'super-role' : '',
              }),
            ),
        },
        linkedRole: { findUnique: jest.fn().mockResolvedValue(null) },
        role: { update },
      },
    } as unknown as PrismaService;
    const service = new ConsoleService(prisma, {} as IdentityService);

    await service.perform(
      'chperm',
      role,
      { ADMIN: '+', MANAGE_ROLES: '+' },
      { userId: 'user-1', permissions: 1n },
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: role.id },
      data: { permissions: 4n },
    });
  });

  it('prevents deletion of the configured default role', async () => {
    const prisma = {
      client: {
        state: {
          findUnique: jest
            .fn()
            .mockImplementation(({ where }: { where: { key: string } }) =>
              Promise.resolve({
                value:
                  where.key === STATE_KEYS.DEFAULT_ROLE_ID
                    ? role.id
                    : 'super-role',
              }),
            ),
        },
      },
    } as unknown as PrismaService;
    const service = new ConsoleService(prisma, {} as IdentityService);

    await expect(service.assertDeletable(role)).rejects.toEqual(
      expect.objectContaining<Partial<ConsoleActionError>>({ status: 409 }),
    );
  });
});
