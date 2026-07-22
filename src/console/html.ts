export function html(strings: TemplateStringsArray, ...values: unknown[]) {
  return strings.reduce(
    (result, part, index) =>
      result + part + (index < values.length ? String(values[index]) : ''),
    '',
  );
}

export function escapeAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
