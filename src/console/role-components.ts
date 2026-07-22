import type { Role } from '@triskcraft/db';
import { AnchorButton, Button, InputSubmitButton } from './components';
import { escapeAttribute, html } from './html';
import { Permissions, PermissionsFlagsBits } from './permissions';

export const FORM_ACTIONS = {
  RMUSR: 'rmusr',
  ADDUSR: 'addusr',
  CHPERM: 'chperm',
  ADDROLE: 'addrole',
  CHNAME: 'chname',
  SETDEFAULT: 'setdefault',
} as const;
export type FormAction = (typeof FORM_ACTIONS)[keyof typeof FORM_ACTIONS];

interface RolePanelData {
  role: Role;
  roles: { id: string; name: string }[];
  users: { id: string; username: string }[];
  defaultRoleId?: string;
  systemRoleId?: string;
}

export function RolePanel({
  role,
  roles,
  users,
  defaultRoleId,
  systemRoleId,
}: RolePanelData) {
  const permissions = new Permissions(role.permissions);
  const permissionList = Object.entries(PermissionsFlagsBits)
    .map(
      ([name, bit]) =>
        html`<li>
          <label
            ><span>${name}</span
            ><input
              type="checkbox"
              ${permissions.has(bit) ? 'checked' : ''}
              name="${name}"
              value="+"
          /></label>
        </li>`,
    )
    .join('');
  const roleList = roles
    .map(
      ({ id, name }) =>
        html`<li class="role-item">
          <a
            href="/console/roles/${id}"
            class="role-link ${id === role.id ? 'active' : ''}"
            ><span>${escapeAttribute(name)}</span
            >${id === defaultRoleId ? '<span class="role-badge">Default</span>' : ''}</a
          >${id === systemRoleId || id === defaultRoleId ? '' : AnchorButton({ href: `/console/roles/${id}/delete`, children: '-', variant: 'danger' })}
        </li>`,
    )
    .join('');
  const userList = users
    .map(
      ({ id, username }) =>
        html`<li>
          <span>${escapeAttribute(username)}</span>
          <form action="?ac=${FORM_ACTIONS.RMUSR}" method="POST">
            <input
              type="hidden"
              name="id"
              value="${escapeAttribute(id)}"
            />${InputSubmitButton({ value: '-', variant: 'danger' })}
          </form>
        </li>`,
    )
    .join('');
  const status =
    role.id === defaultRoleId
      ? '<p class="default-role-status"><span class="role-badge">Default</span>Este rol se asigna automáticamente a los nuevos usuarios.</p>'
      : role.id === systemRoleId
        ? '<p class="default-role-status">El rol Super no puede establecerse como Default.</p>'
        : html`<form
            action="?ac=${FORM_ACTIONS.SETDEFAULT}"
            method="POST"
            class="default-role-form"
          >
            ${Button({ type: 'submit', variant: 'secondary', children: 'Establecer como Default' })}
          </form>`;

  return html`<main class="roles-console">
      <header class="roles-header">
        <div>
          <p class="roles-label">Consola administrativa</p>
          <div class="title-role">
            <h1>Administrar rol</h1>
            <form action="?ac=${FORM_ACTIONS.CHNAME}" method="POST">
              <input
                type="text"
                placeholder="${escapeAttribute(role.name)}"
                name="id"
                required
              />${Button({ type: 'reset', variant: 'secondary', children: 'Restablecer' })}${InputSubmitButton({ value: 'Guardar' })}
            </form>
          </div>
          <p class="roles-description">
            Configura los permisos y miembros asociados a cada rol.
          </p>
          ${status}
        </div>
        <a href="/console" class="back-link">Volver al menú</a>
      </header>
      <div class="roles-grid">
        <aside class="roles-panel">
          <form
            class="member-form"
            method="POST"
            action="?ac=${FORM_ACTIONS.ADDROLE}"
          >
            <h2>Roles</h2>
            <div class="member-input-row">
              <input
                type="text"
                name="id"
                placeholder="Nuevo rol"
                required
              />${InputSubmitButton({ value: 'Agregar' })}
            </div>
          </form>
          <ul class="role-list">
            ${roleList}
          </ul>
        </aside>
        <form
          action="?ac=${FORM_ACTIONS.CHPERM}"
          method="POST"
          class="roles-panel permissions-form"
        >
          <div class="panel-heading">
            <h2>Permisos</h2>
            ${InputSubmitButton({ value: 'Guardar' })}
          </div>
          <ul class="option-list">
            ${permissionList}
          </ul>
        </form>
        <aside class="roles-panel members-panel">
          <form
            class="member-form"
            method="POST"
            action="?ac=${FORM_ACTIONS.ADDUSR}"
          >
            <h2>Miembros</h2>
            <div class="member-input-row">
              <input
                type="text"
                name="id"
                placeholder="ID de Discord"
                required
              />${InputSubmitButton({ value: 'Agregar' })}
            </div>
          </form>
          <ul class="member-list">
            ${userList}
          </ul>
        </aside>
      </div>
    </main>
    ${ROLE_STYLES}`;
}

export function DeleteRoleForm(role: Role) {
  return html`<div class="delete-role">
      <h2>¿Estás seguro de eliminar el rol ${escapeAttribute(role.name)}?</h2>
      <p>Esta acción <strong>no es reversible</strong></p>
      <form action="/console/roles/${role.id}/delete" method="POST">
        ${AnchorButton({ href: '/console/roles', children: 'Cancelar', variant: 'secondary' })}${Button({ type: 'submit', children: 'Eliminar', variant: 'danger' })}
      </form>
      <a href="/console" class="back-link">← Volver al menú</a>
    </div>
    <style>
      .delete-role {
        max-width: 400px;
        background: #fff;
        padding: 25px;
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
      }
      .delete-role form {
        display: flex;
        gap: 10px;
      }
      .back-link {
        display: block;
        margin-top: 15px;
        text-decoration: none;
        color: #007bff;
        font-size: 13px;
      }
    </style>`;
}

const ROLE_STYLES = `<style>
body{align-items:flex-start}.roles-console{box-sizing:border-box;width:min(1100px,calc(100% - 32px));margin:auto;padding:32px 0}.roles-console *{box-sizing:border-box}.roles-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:24px}.roles-header h1{margin:0 0 8px}.roles-label{color:#5865f2;font-size:.8rem;font-weight:700;letter-spacing:.04em;margin:0 0 6px;text-transform:uppercase}.roles-description,.default-role-status{color:#5d6270}.title-role{display:flex;align-items:center;gap:14px}.title-role form{display:flex;gap:6px}.title-role input[type=text]{background:#f4f4f9;padding:6px 8px;border:0;font-size:1.2rem;font-weight:bold;color:#333}.default-role-status{display:flex;align-items:center;font-size:.85rem;gap:8px;margin:14px 0 0}.default-role-form{margin-top:14px}.back-link{color:#5865f2;font-size:.9rem;font-weight:600;text-decoration:none}.roles-grid{display:grid;grid-template-columns:minmax(180px,1fr) minmax(280px,1fr) minmax(260px,1fr);gap:18px;align-items:start}.roles-panel{background:#fff;border:1px solid #d9dce3;border-radius:8px;box-shadow:0 8px 24px rgba(31,35,48,.08);min-width:0;padding:22px}.roles-panel h2{color:#333;font-size:1.15rem;margin:0}.role-list,.option-list,.member-list{list-style:none;margin:18px 0 0;padding:0}.role-item{display:flex;justify-content:space-between;align-items:center;gap:4px}.role-link{align-items:center;flex:1;border-radius:6px;color:#4a4f5d;display:flex;font-weight:600;justify-content:space-between;padding:10px 14px;text-decoration:none}.role-link:hover,.role-link.active{background:#eef0ff;color:#4752c4}.role-badge{background:#dfe3ff;border-radius:999px;color:#4752c4;font-size:.68rem;padding:3px 7px;text-transform:uppercase}.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.option-list,.member-list{border-top:1px solid #e7e8ed}.option-list li,.member-list li{border-bottom:1px solid #e7e8ed}.option-list label,.member-list li{align-items:center;color:#4a4f5d;display:flex;justify-content:space-between;gap:16px;min-height:52px}.option-list input{accent-color:#5865f2;height:18px;width:18px}.member-form{display:flex;flex-direction:column;gap:18px}.member-input-row{display:flex;gap:8px}.member-input-row input{border:1px solid #c9ccd5;border-radius:6px;font:inherit;min-width:0;padding:10px 14px;width:100%}@media(max-width:860px){.roles-grid{grid-template-columns:1fr 1fr}.members-panel{grid-column:1/-1}}@media(max-width:600px){.roles-grid{grid-template-columns:1fr}.members-panel{grid-column:auto}.roles-header{align-items:flex-start;flex-direction:column}.member-input-row,.title-role,.title-role form{flex-direction:column;align-items:stretch}}
</style>`;
