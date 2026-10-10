import { wikiDefaults, wikiPages } from './wiki-data';
import { emptyLayout } from './canvas-schema';
export const initial: Record<string, string> = {
  'pages:custom': '[]',
  'site:header': '{}',
  headline: 'Small proteins.\nBig questions.',
  intro:
    'A shared space to explore prion science. Connect the ideas, understand the mechanisms, and build knowledge together.',
  feature: 'When a fold\nchanges everything.',
  featureBody:
    'Explore the remarkable biology of proteins that can pass on their misfolded shape.',
  title1: 'The fundamentals',
  body1:
    'Start with the protein. Explore what prions are and why their shape matters.',
  title2: 'Mechanisms & structure',
  body2:
    'Follow the connections between protein folding, propagation, and aggregation.',
  title3: 'Disease & discovery',
  body3:
    'Understand prion diseases and the questions driving research forward.',
  order: '1,2,3',
  ...wikiDefaults,
  ...Object.fromEntries(
    ['home', ...wikiPages.map((p) => p.slug)].map((id) => [
      'layout:' + id,
      JSON.stringify(emptyLayout),
    ]),
  ),
  ...Object.fromEntries(
    wikiPages.flatMap((p) => [
      [p.slug + ':title', p.title],
      [p.slug + ':summary', p.summary],
      ...p.sections.map((s) => [p.slug + ':heading:' + s.id, s.title]),
    ]),
  ),
  brand: 'prion collective',
  'home:eyebrow': 'AN iGEM PROJECT WIKI',
  'home:invitation-title': 'Neither is this page.',
  'home:invitation-body':
    'Bring your questions. Connect ideas. Make the picture clearer.',
  'home:knowledge-title': 'Start with a question.',
  'home:directory-title': 'Inside our iGEM wiki.',
  'home:directory-intro':
    'Follow the idea from its first question to its evidence, impact, and people. Team content is being prepared.',
  'footer:tagline': 'Questions into knowledge. Together.',
  'footer:identity': 'iGEM wiki workspace · Team identity & year to confirm',
  'footer:repository': 'Official team GitLab repository: pending',
};
export type Field = keyof typeof initial;
export type Block = { value: string; version: number; author: string };
export type Blocks = Record<Field, Block>;
export const defaultBlocks = Object.fromEntries(
  Object.entries(initial).map(([k, value]) => [
    k,
    { value, version: 0, author: '' },
  ]),
) as Blocks;
