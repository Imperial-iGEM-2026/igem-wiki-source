// Separate template: existing projects keep their original theme and content.
import { readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
const data = JSON.parse(await readFile('app/template-data.json', 'utf8'));
const themes = JSON.parse(await readFile('app/template-styles.json', 'utf8'));
const id = 'notebook-white';
const template = structuredClone(data['notebook-purple']);
template.id = id;
template.name = 'reGELerate · Notebook White';
const home = template.pages.find((page) => page.slug === 'home');
home.layers = home.layers.filter((layer) => layer.id !== 'purple-discovery');
const hero = home.layers.find((layer) => layer.ast.a?.class === 'hero').ast;
const art = hero.c.find((node) => node.a?.class === 'hero-art');
art.c = art.c.filter((node) => node.a?.class !== 'purple-logo-stamp');
function neutral(value, paper = false) {
  return value.replace(
    /#([a-f\d]{8}|[a-f\d]{6}|[a-f\d]{4}|[a-f\d]{3})(?![a-f\d])/gi,
    (_, hex) => {
      if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
      const rgb = [0, 2, 4].map((offset) =>
        parseInt(hex.slice(offset, offset + 2), 16),
      );
      const gray =
        paper && Math.min(...rgb) >= 210
          ? 255
          : Math.round(rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722);
      return '#' + gray.toString(16).padStart(2, '0').repeat(3) + hex.slice(6);
    },
  );
}
const originalIllustrations = new Map();
const illustrationKey = (node) => node.a.id || node.a.class;
function collectIllustrations(node) {
  if (!node || typeof node !== 'object' || !node.t) return;
  if (node.t === 'svg') {
    originalIllustrations.set(illustrationKey(node), node);
    return;
  }
  node.c.forEach(collectIllustrations);
}
for (const page of data.regelerate.pages)
  page.layers.forEach((layer) => collectIllustrations(layer.ast));
function neutralIllustration(node, scientific = false, inSvg = false) {
  if (!node || typeof node !== 'object' || !node.t) return;
  if (node.t === 'svg' && originalIllustrations.has(illustrationKey(node))) {
    Object.assign(
      node,
      structuredClone(originalIllustrations.get(illustrationKey(node))),
    );
    return;
  }
  scientific ||= (node.a.class || '').includes('readouts');
  if (scientific && node.t === 'svg') return;
  inSvg ||= node.t === 'svg';
  for (const key of ['fill', 'stroke', 'style'])
    if (node.a[key])
      node.a[key] = inSvg
        ? node.a[key].replace(
            /#aa85da|#8b4dff|#e2d2f6/gi,
            (color) =>
              ({
                '#aa85da': '#88b2a5',
                '#8b4dff': '#437b77',
                '#e2d2f6': '#dce9e3',
              })[color.toLowerCase()],
          )
        : neutral(node.a[key]);
  node.c.forEach((child) => neutralIllustration(child, scientific, inSvg));
}
for (const page of template.pages)
  page.layers.forEach((layer) => neutralIllustration(layer.ast));
data[id] = template;
const css = postcss.parse(
  themes['notebook-purple'].replaceAll('notebook-purple', id),
);
// Neutral page styling, with the original Notebook's SVG paint declarations.
css.walkDecls((decl) => {
  if (['fill', 'stroke'].includes(decl.prop)) {
    decl.remove();
    return;
  }
  decl.value =
    decl.prop === '--paper'
      ? '#ffffff'
      : neutral(decl.value, /^background(?:-color)?$/.test(decl.prop));
});
const originalCss = postcss.parse(themes.regelerate);
originalCss.walkRules((rule) => {
  const paints = rule.nodes.filter(
    (node) => node.type === 'decl' && ['fill', 'stroke'].includes(node.prop),
  );
  if (!paints.length) return;
  const restored = rule.clone({
    selector: rule.selector.replaceAll('regelerate', id),
    nodes: [],
  });
  paints.forEach((paint) => restored.append(paint.clone()));
  css.append(restored);
});
const scope = `[data-template-theme="${id}"]`;
themes[id] =
  css.toString() +
  `
${scope} { --paper: #ffffff; --ink: #252525; --teal: #454545; --gold: #888888; --line: #e2e2e2; background: #ffffff; min-height: 100vh; }
${scope}::after { display: none; }
${scope} .wiki-header, ${scope} .nav-dropdown, ${scope} .notebook,
${scope} .purple-discovery article, ${scope} .purple-note,
${scope} .purple-margin-note, ${scope} .purple-timeline-entry,
${scope} .purple-network { background: #ffffff; }
${scope} .hero-art .notebook, ${scope} .notebook, ${scope} .purple-discovery article, ${scope} .purple-note,
${scope} .purple-margin-note, ${scope} .purple-timeline-entry, ${scope} .purple-network {
  box-shadow: none; border-color: #e2e2e2; border-radius: 3px; transform: none;
}
${scope} .hero .button { background: #252525; box-shadow: none; border-radius: 3px; }
${scope} .hero .button:hover { background: #444444; transform: none; }
${scope} .hero h1 em { font-style: normal; }
${scope} .hero h1 em::after, ${scope} .page-heading::after { display: none; }
${scope} .handwritten, ${scope} .hero-note, ${scope} .annotation, ${scope} .purple-margin-note p {
  font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; font-style: normal; transform: none;
}
${scope} .purple-step { font-family: 'DM Sans', Arial, sans-serif; font-size: 23px; }
${scope} .wiki-content > *, ${scope} .purple-page-section, ${scope} .purple-timeline-entry { min-width: 0; }
${scope} .purple-page-section h2 { overflow-wrap: break-word; }
${scope} .brand-mark img, ${scope} .purple-logo-stamp img { mix-blend-mode: normal; filter: none; }
${scope} .hero-art .notebook {
  background: #ffffff; border: 0; border-radius: 0; box-shadow: none; overflow: visible;
}
${scope} .hero-art .notebook::before { display: none; }
${scope} .hero-art .hero-note {
  font-family: 'Caveat', 'Segoe Print', cursive; font-size: 28px; font-weight: 400;
  color: #437b77; transform: rotate(-4deg); margin-bottom: 6px;
}
${scope} .hero-art .notebook-bottom { color: #617769; }
${scope} .hero-art .notebook-bottom i { background: #598984; }
${scope} .hero-art .notebook-bottom i.ochre { background: #bd923e; }
`;
await writeFile('app/template-data.json', JSON.stringify(data));
await writeFile('app/template-styles.json', JSON.stringify(themes));
console.log(
  `Built ${template.name}: ${template.pages.length} editable pages, pure white surfaces and purple logo.`,
);
