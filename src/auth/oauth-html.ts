function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function oauthErrorHtml(
  message: string,
  title = 'Bad Request',
  code: number | string = 400,
) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body><main><span>${escapeHtml(String(code))}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/">Back</a></main></body></html>`;
}
