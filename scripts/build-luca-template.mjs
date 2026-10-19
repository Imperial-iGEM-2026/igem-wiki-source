import { readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';

const scope = '[data-template-theme="luca"]';
const css = postcss.parse(await readFile('app/luca-theme.css', 'utf8'));
css.walkRules((rule) => {
  if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map((selector) =>
    selector.startsWith(scope) ? selector : `${scope} ${selector}`,
  );
});
await writeFile('app/luca-styles.json', JSON.stringify(css.toString()) + '\n');
