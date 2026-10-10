import source from './template-data.json';
import { emptyLayout, CUSTOM_HEADING, CUSTOM_CONTENT } from './canvas-schema';
export type TemplateAst =
  | string
  | { f: string }
  | { t: string; a: Record<string, string>; c: TemplateAst[] };
export type TemplatePage = {
  slug: string;
  title: string;
  mainClass: string;
  layers: { id: string; label: string; region: string; ast: TemplateAst }[];
};
export type Template = {
  id: string;
  name: string;
  pages: TemplatePage[];
  fields: Record<string, string>;
};
export const templates: Record<string, Template> = {
  ...(source as unknown as Record<string, Template>),
  blank: {
    id: 'blank',
    name: 'Blank canvas',
    pages: [{ slug: 'home', title: 'Home', mainClass: '', layers: [] }],
    fields: {},
  },
};
export const templateList = Object.values(templates).map(
  ({ id, name, pages }) => ({ id, name, pageCount: pages.length }),
);
export function templateFor(data: Record<string, { value: string }>) {
  const id = data['site:template']?.value;
  return id && Object.hasOwn(templates, id) ? templates[id] : undefined;
}
export function templateDefaults(id: string): Record<string, string> {
  const template = templates[id];
  if (!Object.hasOwn(templates, id)) throw Error('Unknown template');
  return {
    'site:template': id,
    'site:appearance': id,
    'pages:custom': '[]',
    'pages:removed': '[]',
    'site:menu': '',
    'ai:brief': '',
    'site:header': '{}',
    brand: id === 'blank' ? 'Untitled website' : 'reGELerate',
    intro: '',
    order: '1,2,3',
    'footer:repository': '',
    ...template.fields,
    ...Object.fromEntries(
      template.pages.flatMap((page) => [
        [page.slug + ':title', page.title],
        [page.slug + ':summary', ''],
        ['layout:' + page.slug, JSON.stringify(emptyLayout)],
      ]),
    ),
  };
}

// Team-created pages borrow the layout of a template content page: its page
// heading and its sidebar + content grid. Their sections live in CUSTOM_CONTENT.
export { CUSTOM_HEADING, CUSTOM_CONTENT };
const hasClass = (ast: TemplateAst, name: string) =>
  typeof ast === 'object' &&
  !('f' in ast) &&
  new RegExp('\\b' + name + '\\b').test(ast.a.class || '');
export function contentPrototype(template: Template) {
  for (const page of template.pages) {
    const main = page.layers.filter((l) => l.region === 'main');
    const heading = main.find((l) => hasClass(l.ast, 'page-heading'));
    const content = main.find((l) => hasClass(l.ast, 'wiki-content'));
    if (heading && content)
      return {
        mainClass: page.mainClass,
        heading: heading.ast,
        content: content.ast,
        // Content pages have their own footer (different from Home's).
        chrome: page.layers.filter((l) => l.region !== 'main'),
      };
  }
  return undefined;
}
export function pageMainClass(templateId: string | undefined, page: string) {
  const template = templateId ? templates[templateId] : undefined;
  if (!template) return '';
  const definition = template.pages.find((p) => p.slug === page);
  return definition
    ? definition.mainClass
    : contentPrototype(template)?.mainClass || '';
}
