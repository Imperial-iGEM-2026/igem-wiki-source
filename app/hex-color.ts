/** Accept CSS hex notation only; expand shorthand for a consistent field. */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return null;
  return (
    '#' +
    (raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
    ).toUpperCase()
  );
}
