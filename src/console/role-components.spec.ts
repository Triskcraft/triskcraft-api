import { RolePanel } from './role-components';

describe('RolePanel', () => {
  it('renders the migrated role, permission and member controls', () => {
    const page = RolePanel({
      role: { id: 'role-1', name: 'Staff', permissions: 6n },
      roles: [
        { id: 'role-1', name: 'Staff' },
        { id: 'role-2', name: 'Members' },
      ],
      users: [{ id: 'discord-1', username: 'Steve' }],
      defaultRoleId: 'role-2',
      systemRoleId: 'role-1',
    });

    expect(page).toContain('Administrar rol');
    expect(page).toContain('name="MANAGE_MODPACK"');
    expect(page).toContain('name="MANAGE_ROLES"');
    expect(page).toContain('discord-1');
    expect(page).toContain('Default');
    expect(page).not.toContain('/console/roles/role-1/delete');
  });
});
