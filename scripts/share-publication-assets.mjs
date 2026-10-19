import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cssResources } from './igem-resources.mjs';

// React's attribute escaping, decoded once (not a general HTML parser).
const unescapeAttribute = (value) => value.replace(/&(amp|quot|#x27|#39|lt|gt);/g,
  (_, entity) => ({ amp: '&', quot: '"', '#x27': "'", '#39': "'", lt: '<', gt: '>' })[entity]);

export function sharedPublicationAssets(output, base) {
  const pending = new Map();
  const store = (text, extension) => {
    const name = createHash('sha256').update(text).digest('hex') + extension;
    pending.set(name, text);
    return `${base}assets/shared/${name}`;
  };
  return {
    rewrite(document) {
      // Preserve stylesheet order. Keep relative URLs and attributed <style>
      // elements inline: relocating them could change URL resolution or scripts.
      document = document.replace(/<style>([\s\S]*?)<\/style>/g, (whole, css) => {
        try {
          // A quoted data SVG can contain its own url(#filter). Ignore its
          // contents when deciding whether CSS has page-relative dependencies.
          const dependencies = css.replace(/url\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*\)/gi,
            (match, quoted) => /^['"]data:/i.test(quoted) ? 'url(data:,)' : match);
          if (cssResources(dependencies).some((url) => !/^(?:https?:|data:|\/)/i.test(url))) return whole;
        } catch { return whole; }
        return `<link rel="stylesheet" href="${store(css, '.css')}">`;
      });
      // Fetch as inert JSON and reconstruct the existing opaque data frame. Never
      // navigate the sandbox to a same-origin HTML file or execute it in the parent.
      return document.replace(/data-html-document="([^"]*)"/g, (_, encoded) => {
        const source = unescapeAttribute(encoded);
        const parts = [];
        let offset = 0;
        for (const block of source.matchAll(/<(style|script)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
          if (block[2].length < 1024) continue;
          const start = block.index + block[0].indexOf('>') + 1;
          parts.push(source.slice(offset, start));
          parts.push({ url: store(JSON.stringify(block[2]), '.json') });
          offset = start + block[2].length;
        }
        parts.push(source.slice(offset));
        return `data-html-source="${store(JSON.stringify(parts), '.json')}"`;
      });
    },
    async write() {
      const folder = path.join(output, 'public/assets/shared');
      await mkdir(folder, { recursive: true });
      for (const [name, text] of pending) await writeFile(path.join(folder, name), text);
    },
  };
}
