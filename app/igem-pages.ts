// iGEM 2026 standard award routes. Core pages are checked for every export.
export const coreIgemPages = [
  'contribution',
  'engineering',
  'human-practices',
];
export const igemAwards = [
  ['education', 'Education'],
  ['entrepreneurship', 'Entrepreneurship'],
  ['hardware', 'Hardware'],
  ['inclusivity', 'Inclusivity'],
  ['human-practices', 'Integrated Human Practices'],
  ['measurement', 'Measurement'],
  ['model', 'Model'],
  ['alternative-platform', 'Alternative Platform'],
  ['safety-and-security', 'Safety and Security'],
  ['software', 'Software'],
  ['sustainability', 'Sustainable Development Impact'],
] as const;

export function publicationSlug(slug: string, slugs: string[]): string {
  // Preserve saved editor IDs and content. An explicitly authored standard page wins.
  return slug === 'safety' && !slugs.includes('safety-and-security')
    ? 'safety-and-security'
    : slug;
}

export function igemPageCheck(
  slugs: string[],
  selected: string[],
  base: string,
) {
  const published = new Set(slugs.map((slug) => publicationSlug(slug, slugs)));
  return [...new Set([...coreIgemPages, ...selected])].map((slug) => ({
    slug,
    path: base + slug,
    present: published.has(slug),
  }));
}
