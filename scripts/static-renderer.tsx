import { renderToStaticMarkup } from 'react-dom/server';
import Home from '../app/home';
export { initial, defaultBlocks } from '../app/content';
export { wikiPages } from '../app/wiki-data';
export { validateLayout } from '../app/canvas-schema';
import type { Blocks } from '../app/content';
import type { WikiPage } from '../app/wiki-data';
export function render(data: Blocks, wiki?: WikiPage) {
  return renderToStaticMarkup(
    <Home user={null} initialData={data} wiki={wiki} publication />,
  );
}

export {
  customDefaults,
  parseCustomPages,
  customWikiPage,
  CUSTOM_PAGES,
  REMOVED_PAGES,
  parseRemovedPages,
} from '../app/custom-pages';

export { templates, templateDefaults } from '../app/templates';

export { sponsorLayers } from '../app/sponsor-layers';

export { igemAwards, igemPageCheck, publicationSlug } from '../app/igem-pages';
