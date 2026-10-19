import sourceStyles from './template-styles.json';
import lucaStyles from './luca-styles.json';

const styles: Record<string, string> = { ...sourceStyles, luca: lucaStyles };

// Shared by the renderer and read-only MCP inspection so both expose the
// same appearance overlay, scoped to the original content template.
export function templateCss(id: string, appearanceId?: string, editor = false) {
  let css = Object.hasOwn(styles, id) ? styles[id] : '';
  if (appearanceId && appearanceId !== id && Object.hasOwn(styles, appearanceId)) {
    css += '\n' + styles[appearanceId]
      .replaceAll(`data-template-theme="${appearanceId}"`, `data-template-theme="${id}"`)
      .replaceAll(`data-template-theme='${appearanceId}'`, `data-template-theme='${id}'`);
  }
  return editor ? css
    .replace(/@media\s*\((max|min)-width\s*:\s*([^)]*)\)/g, '@container studioPage ($1-width: $2)')
    .replaceAll('vw', 'cqw') : css;
}
