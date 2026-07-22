import type { Request } from 'express';

export function readCookie(request: Request, name: string) {
  const header = request.headers.cookie;
  if (!header) return null;
  const item = header
    .split(';')
    .find((part) => part.trim().startsWith(`${name}=`));
  return item ? decodeURIComponent(item.trim().slice(name.length + 1)) : null;
}
