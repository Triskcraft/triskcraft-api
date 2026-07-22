export const PermissionsFlagsBits = {
  ADMIN: 1n << 0n,
  MANAGE_MODPACK: 1n << 1n,
  MANAGE_ROLES: 1n << 2n,
} as const;

export type PermissionName = keyof typeof PermissionsFlagsBits;

export class Permissions {
  readonly bitfield: bigint;

  constructor(value: bigint | readonly string[] = 0n) {
    this.bitfield =
      typeof value === 'bigint'
        ? value
        : value.reduce(
            (result, name) =>
              name in PermissionsFlagsBits
                ? result | PermissionsFlagsBits[name as PermissionName]
                : result,
            0n,
          );
  }

  has(bits: bigint) {
    return (this.bitfield & bits) === bits;
  }

  any(bits: bigint) {
    return (this.bitfield & bits) !== 0n;
  }
}
