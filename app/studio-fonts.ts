export type StudioFont = { label: string; value: string; category: string };
/** Device fonts with explicit fallbacks: exports need no third-party font host. */
export const studioFonts: StudioFont[] = [
  {
    label: 'System UI',
    value: 'system-ui, sans-serif',
    category: 'Sans serif',
  },
  ...[
    'Arial',
    'Arial Black',
    'Aptos',
    'Calibri',
    'Candara',
    'Century Gothic',
    'Corbel',
    'Helvetica',
    'Segoe UI',
    'Tahoma',
    'Trebuchet MS',
    'Verdana',
  ].map((name) => ({
    label: name,
    value: `"${name}", Arial, sans-serif`,
    category: 'Sans serif',
  })),
  ...[
    'Baskerville',
    'Book Antiqua',
    'Cambria',
    'Constantia',
    'Garamond',
    'Georgia',
    'Palatino',
    'Times New Roman',
  ].map((name) => ({
    label: name,
    value: `"${name}", Georgia, serif`,
    category: 'Serif',
  })),
  ...['Consolas', 'Courier New', 'Lucida Console', 'Menlo', 'Monaco'].map(
    (name) => ({
      label: name,
      value: `"${name}", monospace`,
      category: 'Monospace',
    }),
  ),
  {
    label: 'Impact',
    value: 'Impact, "Arial Black", sans-serif',
    category: 'Display',
  },
  {
    label: 'Comic Sans MS',
    value: '"Comic Sans MS", cursive',
    category: 'Handwriting',
  },
  { label: 'Monospace', value: 'monospace', category: 'Monospace' },
];
export function selectedFont(family: string) {
  const first = family.split(',')[0].trim().replace(/["']/g, '').toLowerCase();
  return studioFonts.find(
    (font) =>
      font.value.split(',')[0].replace(/["']/g, '').toLowerCase() === first,
  );
}
export function filterFonts(query: string) {
  const words = query.toLowerCase().trim().split(/\s+/);
  return studioFonts.filter((font) =>
    words.every((word) =>
      `${font.label} ${font.category}`.toLowerCase().includes(word),
    ),
  );
}
