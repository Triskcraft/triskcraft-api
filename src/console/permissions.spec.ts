import { Permissions, PermissionsFlagsBits } from './permissions';

describe('Permissions', () => {
  it('keeps the legacy bit assignments and supports all/any checks', () => {
    const permissions = new Permissions(['MANAGE_MODPACK', 'MANAGE_ROLES']);

    expect(permissions.bitfield).toBe(6n);
    expect(permissions.has(PermissionsFlagsBits.MANAGE_MODPACK)).toBe(true);
    expect(
      permissions.has(
        PermissionsFlagsBits.MANAGE_MODPACK | PermissionsFlagsBits.MANAGE_ROLES,
      ),
    ).toBe(true);
    expect(permissions.any(PermissionsFlagsBits.ADMIN)).toBe(false);
  });

  it('ignores unknown form fields when building a bitfield', () => {
    expect(new Permissions(['ADMIN', 'csrf']).bitfield).toBe(1n);
  });
});
