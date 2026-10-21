import { pageCatalog, parseRemovedPages } from './custom-pages';
import { pageLayers } from './template-transform';
import { materialize } from './studio-engine';
import { emptyLayout, type CanvasLayout } from './canvas-schema';
import { isSiteHeader } from './site-header-layer';
import { sectionAnchor } from './section-links';
import { referenceAnchor } from './reference-anchor';
export type SectionLinkTarget = { anchor: string; label: string };
export function sectionLinkTargets(data: Record<string, {value:string}>, page: string, draft?: CanvasLayout): SectionLinkTarget[] {
  if (parseRemovedPages(data['pages:removed']?.value).includes(page)) return [];
  const layers = pageLayers(data, page).layers;
  let saved: CanvasLayout;
  try { saved = draft || JSON.parse(data['layout:' + page]?.value || JSON.stringify(emptyLayout)); } catch { return []; }
  const layout = materialize(saved, layers), nodes = new Map(layout.nodes.map(n => [n.id,n]));
  const builtins = new Map(layers.map(n => [n.id,n]));
  const targets: SectionLinkTarget[] = [];
  for (const id of layout.order) {
    const node = nodes.get(id); if (!node) continue;
    let current: typeof node | undefined = node; const seen = new Set<string>(); let visible = true;
    while (current) {
      const builtin = builtins.get(current.id);
      if (seen.has(current.id) || current.hidden || current.deleted || (builtin && builtin.region !== 'main') || isSiteHeader(current,layout.nodes,builtin?.region)) { visible=false; break; }
      seen.add(current.id); current=nodes.get(current.parentId || '');
    }
    if (!visible) continue;
    const label = (node.indexLabel || node.title || builtins.get(id)?.label || (['section','html','accordion'].includes(node.kind) ? node.name : '') || '').replace(/<[^>]*>/g,' ').trim();
    if (label) targets.push({anchor:sectionAnchor(id),label});
    if (node.kind === 'references') for (const entry of node.references || [])
      targets.push({anchor:encodeURIComponent(referenceAnchor(id, entry.id)),label:(label || 'References')+' › '+(entry.text || 'Untitled reference').slice(0,160)});
    for (const item of node.items || []) if (item.title) targets.push({anchor:sectionAnchor(id,item.id),label:(label ? label+' › ' : '')+item.title});
  }
  return targets;
}

export function sectionLinkPages(data: Record<string,{value:string}>): [string,string][] {
  const removed=new Set(parseRemovedPages(data['pages:removed']?.value));
  return [{slug:'home',title:'Home'},...pageCatalog(data)].filter(p=>!removed.has(p.slug)).map(p=>[p.slug==='home' ? '/' : '/'+p.slug,p.title]);
}
