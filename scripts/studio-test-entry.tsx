import { renderToStaticMarkup } from 'react-dom/server';
import { StudioEditor } from '../app/studio-editor';
import { CanvasSurface } from '../app/canvas-surface';
import { CanvasContext, PageCanvas } from '../app/page-canvas';
import { defaultBlocks } from '../app/content';
import { emptyLayout, type CanvasLayout } from '../app/canvas-schema';
export * from '../app/studio-engine';
export * from '../app/canvas-schema';
export * from '../app/custom-css';
export * from '../app/drag-session';
const builtins = [
  {
    id: 'intro',
    label: 'Introduction',
    node: (
      <section id="intro">
        <h1>Prion research</h1>
      </section>
    ),
  },
];
export function renderStudio() {
  return renderToStaticMarkup(
    <StudioEditor
      page="home"
      ctx={{
        data: defaultBlocks,
        editing: true,
        busy: false,
        locked: false,
        save: async () => true,
        dirty: () => {},
      }}
      layout={emptyLayout}
      version={0}
      builtins={builtins}
    />,
  );
}
export function renderCanvas(layout: CanvasLayout) {
  return renderToStaticMarkup(
    <CanvasSurface layout={layout} builtins={builtins} publication />,
  );
}
export function renderTemplateAppearance(
  layout: CanvasLayout,
  templateId: string,
  appearanceId: string,
) {
  return renderToStaticMarkup(
    <CanvasSurface
      layout={layout}
      builtins={builtins}
      templateId={templateId}
      appearanceId={appearanceId}
      publication
    />,
  );
}
export function renderSavedPage(value: string | undefined, editing: boolean) {
  return renderToStaticMarkup(
    <CanvasContext.Provider
      value={{
        data:
          value === undefined
            ? {}
            : { 'layout:results': { value, version: 7, author: 'Test' } },
        editing,
        busy: false,
        locked: false,
        save: async () => {
          throw Error('Unexpected save');
        },
        dirty: () => {},
      }}
    >
      <PageCanvas page="results">
        <section id="original-template">Template</section>
      </PageCanvas>
    </CanvasContext.Provider>,
  );
}

import { CssPanel } from '../app/css-panel';
import { StudioPages } from '../app/studio-pages';
export * from '../app/studio-target';
export function renderAssistant() {
  return renderToStaticMarkup(
    <CssPanel
      value=""
      page="home"
      layers={[]}
      disabled={false}
      enabled
      onEnabled={() => {}}
      onPreview={() => {}}
      onChange={() => {}}
      onEnd={() => {}}
      target={null}
      showCode={false}
      onShowCode={() => {}}
    />,
  );
}
export function renderPages(query = '') {
  return renderToStaticMarkup(
    <StudioPages
      page="home"
      query={query}
      onQuery={() => {}}
      onNavigate={() => {}}
    />,
  );
}

export * from '../app/selection-style';

export * from '../app/custom-pages';
export * from '../app/studio-navigation';

export * from '../app/hex-color';
import { HexColorPicker } from '../app/hex-color-picker';
export function renderColour() {
  return renderToStaticMarkup(
    <HexColorPicker
      label="Text colour"
      value="#1a3"
      onChange={() => {}}
      onEnd={() => {}}
    />,
  );
}

export * from '../app/studio-fonts';

import { AssistantComposer, ReasoningControl } from '../app/assistant-composer';
export function renderReasoning() {
  return renderToStaticMarkup(
    <ReasoningControl effort="medium" onChange={() => {}} disabled={false} />,
  );
}
export function renderComposer(
  working = false,
  available = true,
  prompt = 'Refine the heading',
  withImage = false,
  attaching = false,
) {
  return renderToStaticMarkup(
    <AssistantComposer
      codex
      images={
        withImage
          ? [{ url: '/api/media/test.png', name: 'Screenshot.png', size: 100 }]
          : []
      }
      attaching={attaching}
      prompt={prompt}
      onPromptChange={() => {}}
      effort="medium"
      onEffortChange={() => {}}
      working={working}
      disabled={false}
      available={available}
      onSend={() => {}}
      onCancel={() => {}}
    />,
  );
}

import { previewFields } from '../app/page-proposal';
import type { ReactNode } from 'react';
export function renderPageProposalPreview() {
  const Directory = ({ field }: { field: (id: string) => ReactNode }) => (
    <div>{field('nested')}</div>
  );
  return renderToStaticMarkup(
    previewFields(
      <section>
        <h1 data-field-id="headline" role="button" tabIndex={0}>
          Before
        </h1>
        <Directory field={(id) => <span data-field-id={id}>Old nested</span>} />
      </section>,
      { headline: '<script>new headline</script>', nested: 'New nested text' },
    ),
  );
}

export { aiRequest } from '../app/ai-request';

import { AssistantActivity } from '../app/assistant-activity';
export function renderAssistantActivity(working = true) {
  return renderToStaticMarkup(
    <AssistantActivity
      events={[{ type: 'progress', phase: 'thinking', state: 'running' }]}
      working={working}
    />,
  );
}

export { unifiedDiff, pageDiffFiles } from '../app/assistant-diff';

export { uploadMedia } from '../app/upload-media';

export * from '../app/header-schema';
import { HeaderBrand } from '../app/header-design';
import type { HeaderDesign } from '../app/header-schema';
export function renderHeader(design: HeaderDesign) {
  return renderToStaticMarkup(
    <HeaderBrand design={design} fallback="Original name" />,
  );
}

import Home from '../app/home';
import { pageCatalog } from '../app/custom-pages';
import type { Blocks } from '../app/content';
export function renderCompletePreview(
  data: Blocks,
  slug = 'home',
  selectedFrom: Blocks = data,
  editing = false,
) {
  return renderToStaticMarkup(
    <Home
      user={editing ? { id: 'test', name: 'Test' } : null}
      publication={!editing}
      startEditing={editing}
      initialData={data}
      wiki={pageCatalog(selectedFrom).find((p) => p.slug === slug)}
    />,
  );
}
export function renderPageHeaderEntry() {
  return renderToStaticMarkup(
    <StudioPages
      page="home"
      query=""
      onQuery={() => {}}
      onNavigate={() => {}}
      onHeader={() => {}}
    />,
  );
}
export { setApiProject, projectFetch, projectURL } from '../app/project-api';

export * from '../app/link-url';
export { templates, templateDefaults } from '../app/templates';

export { mergeContentRows } from '../app/content-sync';

export {
  selectionDiffFiles,
  assistantConversationKey,
} from '../app/assistant-diff';

export { pageLayers } from '../app/template-transform';
export { sponsorLayers } from '../app/sponsor-layers';

export { renderEquation, splitMathText } from '../app/equation-block';

export { referenceIndex, citationToken } from '../app/references';
export { startReferenceNavigation } from '../app/reference-navigation';
