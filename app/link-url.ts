/** Shared navigation validation. Links never execute scripts or carry credentials. */
export function safeLink(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 2048 ||
    /[\s<>"\\]/.test(value) ||
    /%0[ad]/i.test(value)
  )
    return false;
  for (const char of value)
    if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return false;
  if (
    /^(?:\/(?:[a-z][a-z0-9-]{0,59})?)?(?:#[A-Za-z](?:[A-Za-z0-9_.:-]|%[0-9A-Fa-f]{2})*)?$/.test(
      value,
    )
  )
    {
      try {
        return !/[\u0000-\u001f\u007f]/.test(decodeURIComponent(value));
      } catch { return false; }
    }
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      ? Boolean(url.hostname && !url.username && !url.password)
      : url.protocol === 'mailto:'
        ? /^mailto:[^?#]+(?:\?[^#]*)?$/.test(value)
        : url.protocol === 'tel:' && /^tel:\+?[0-9().-]+$/.test(value);
  } catch {
    return false;
  }
}
export function linkAllowed(value: string, pages: Iterable<string>) {
  return (
    safeLink(value) &&
    (!value.startsWith('/') || new Set(pages).has(value.split('#')[0]))
  );
}
