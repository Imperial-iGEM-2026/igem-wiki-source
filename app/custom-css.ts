import parse from 'postcss/lib/parse';
import selectorParser from 'postcss-selector-parser';
import { AtRule, Rule, type ChildNode } from 'postcss';

// One parser and policy are used by the inspector, API, renderer and static export.
// Rules can address page descendants only. Resource loading and global at-rules
// are deliberately excluded; media remains managed by the authenticated uploader.
export function compileCustomCss(
  source: string,
  scope = '[data-page-css]',
  editor = false,
): string {
  if (typeof source !== 'string') throw Error('CSS must be text.');
  if (!source.trim()) return '';
  if (
    /[\\<]/.test(source) ||
    Array.from(source).some(
      (c) => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0)),
    )
  )
    throw Error('CSS escapes, HTML, and control characters are not supported.');
  const root = parse(source, { from: undefined });
  // Manual controls must win over authored !important rules too. During a
  // drag we use inline !important; without a priority layer, committing that
  // same value to a stylesheet can lose to a more specific page selector.
  // Keep the stored selectors unchanged for editing, undo and migrations.
  const controls = new Set<ChildNode>();
  root.walkComments((comment) => {
    const next = comment.next();
    if (
      comment.parent === root &&
      comment.text === 'prion-selection-controls' &&
      (next?.type === 'rule' ||
        (next?.type === 'atrule' && next.name === 'media'))
    )
      controls.add(next);
  });
  root.walkComments((comment) => {
    comment.remove();
  });
  const clean = root.toString();
  if (
    /(?:url|(?:-webkit-)?image-set|image|src|expression)\s*\(|javascript\s*:|https?\s*:|@import/i.test(
      clean,
    )
  )
    throw Error(
      'External resources and executable CSS are not allowed. Add media through the media controls.',
    );
  // A manually sized/shifted image can fit the desktop artboard but overflow
  // its narrower published column before the tablet breakpoint is reached.
  // Preserve the saved pose wherever it fits, and constrain only these generated
  // positive horizontal placements to the image frame's actual inline size.
  for (const control of controls) {
    if (control.type !== 'rule' ||
      !/^\[data-layer-id="[\w-]+"\](?: > [a-z][\w-]*:nth-of-type\(\d+\))+ > img:nth-of-type\(\d+\)$/.test(control.selector)) continue;
    const width = control.nodes.findLast((n) => n.type === 'decl' && n.prop === 'width');
    const translate = control.nodes.findLast((n) => n.type === 'decl' && n.prop === 'translate');
    if (width?.type !== 'decl' || translate?.type !== 'decl' ||
      !/^\d+(?:\.\d+)?px$/.test(width.value)) continue;
    const offset = /^(\d+(?:\.\d+)?px)(?:\s+(-?\d+(?:\.\d+)?px))?$/.exec(translate.value);
    if (!offset) continue;
    const savedWidth = width.value;
    width.value = `min(${savedWidth}, 100%)`;
    translate.value = `clamp(0px, calc(100cqw - ${savedWidth}), ${offset[1]}) ${offset[2] || '0px'}`;
    const frame = new Rule({ selector: control.selector.replace(/ > img:nth-of-type\(\d+\)$/, '') });
    frame.append({ prop: 'container-type', value: 'inline-size', important: true });
    root.append(frame);
  }
  root.walk((node) => {
    if (node.type === 'atrule') {
      if (node.name.toLowerCase() !== 'media' || !node.nodes)
        throw Error(
          'Only ordinary CSS rules and @media width queries are supported.',
        );
      if (
        !/^\(\s*(?:min|max)-width\s*:\s*\d{2,4}px\s*\)(?:\s+and\s+\(\s*(?:min|max)-width\s*:\s*\d{2,4}px\s*\))*$/i.test(
          node.params,
        )
      )
        throw Error(
          'Use @media (max-width: 760px) or min-width queries in pixels.',
        );
      if (editor) {
        node.name = 'container';
        node.params = 'studioPage ' + node.params;
      }
    } else if (node.type === 'rule') {
      if (node.parent?.type === 'rule')
        throw Error(
          'Write selectors in full; nested CSS rules are not supported.',
        );
      const selectors = selectorParser().astSync(node.selector);
      // React's static HTML writes `padding-inline:4px`; the browser's
      // CSSOM writes `padding-inline: 4px`. Legacy page styles use these
      // declaration substrings to identify frames, including inside :not().
      // Match both serializations without changing specificity or saved CSS.
      // Only normalize single declarations, never strings or arbitrary style
      // fragments whose whitespace could be meaningful.
      const styleAttributes: import('postcss-selector-parser').Attribute[] = [];
      selectors.walkAttributes((attribute) => {
        if (attribute.attribute === 'style' && attribute.operator === '*=')
          styleAttributes.push(attribute);
      });
      for (const attribute of styleAttributes) {
        const match = /^([\w-]+)\s*:\s*([^:;'"]+?)(;?)$/.exec(attribute.value || '');
        if (!match) continue;
        const values = new Set([
          attribute.value!,
          `${match[1]}:${match[2].trim()}${match[3]}`,
          `${match[1]}: ${match[2].trim()}${match[3]}`,
        ]);
        if (values.size < 2) continue;
        const alternatives = selectorParser.pseudo({ value: ':is' });
        for (const value of values) {
          const selector = selectorParser.selector({ value: '' });
          const variant = attribute.clone();
          variant.setValue(value, { quoteMark: '"' });
          selector.append(variant);
          alternatives.append(selector);
        }
        attribute.replaceWith(alternatives);
      }
      selectors.walk((n) => {
        if (
          n.type === 'nesting' ||
          (n.type === 'pseudo' &&
            [':root', ':scope', ':host', ':global'].includes(
              n.value.toLowerCase(),
            ))
        )
          throw Error(
            'Target page elements such as .page-canvas, h2, or [data-layer-id="…"].',
          );
      });
      node.selector = selectors.nodes
        .map((selector) => {
          if (!selector.nodes.length || selector.first?.type === 'combinator')
            throw Error(
              'A selector must start with a page element, class, or attribute.',
            );
          return scope + ' ' + selector.toString().trim();
        })
        .join(',\n');
    } else if (node.type === 'decl') {
      if (
        node.parent?.type !== 'rule' ||
        !/^(?:--[a-zA-Z0-9-]+|-?[a-zA-Z][a-zA-Z0-9-]*)$/.test(node.prop)
      )
        throw Error('Place valid CSS properties inside a selector block.');
      if (['behavior', '-moz-binding'].includes(node.prop.toLowerCase()))
        throw Error('This CSS property is not supported.');
      // The editor's page can be narrower than the browser window. Match its
      // viewport-based typography and full-bleed sections to the page canvas.
      if (editor)
        node.value = node.value.replace(/(-?(?:\d*\.)?\d+)vw\b/gi, '$1cqw');
    } else throw Error('Unsupported CSS syntax.');
  });
  if (editor) {
    // A zoomed, nested editor scrollport can leave view()/scroll() animations
    // at their transparent entrance frame. Show their completed pose in Design;
    // Preview/export still use the original scroll timeline and saved CSS.
    // Clone at the end of the same media scope so later animation shorthands
    // cannot reset these longhands. Do not override authored opacity/display.
    const reveals: import('postcss').Rule[] = [];
    root.walkRules((rule) => {
      const timeline = rule.nodes.findLast(
        (node) =>
          node.type === 'decl' &&
          node.prop.toLowerCase() === 'animation-timeline',
      );
      if (
        timeline?.type === 'decl' &&
        /\b(?:view|scroll)\s*\(|--[\w-]+/i.test(timeline.value)
      )
        reveals.push(rule);
    });
    for (const rule of reveals) {
      const pose = rule.clone({ nodes: [] });
      for (const [prop, value] of Object.entries({
        'animation-timeline': 'auto',
        'animation-range': 'normal',
        'animation-duration': '1ms',
        'animation-delay': '-1ms',
        'animation-iteration-count': '1',
        'animation-fill-mode': 'both',
        'animation-play-state': 'paused',
      }))
        pose.append({ prop, value, important: true });
      rule.parent?.append(pose);
    }
  }
  // Important declarations in a layer outrank unlayered important styles,
  // regardless of selector specificity. Compile only after normal validation,
  // and use the same layer in editor, preview and static export.
  if (controls.size) {
    const layer = new AtRule({ name: 'layer', params: 'studio-selection' });
    for (const node of controls) layer.append(node.remove());
    root.prepend(layer);
  }
  return root.toString();
}
export function cssError(source: string): string {
  try {
    compileCustomCss(source);
    return '';
  } catch (error) {
    const e = error as {
      reason?: string;
      message?: string;
      line?: number;
      column?: number;
    };
    return (
      (e.line ? `Line ${e.line}, column ${e.column}: ` : '') +
      (e.reason || e.message || 'Invalid CSS.')
    );
  }
}

/** Compare unaffected rules when an AI request targets a single element. */
export function outsideTargetCss(source: string, target: string) {
  const result: string[] = [];
  parse(source || '').walkRules((rule) => {
    const selected = rule.selectors.every((s) => {
      if (s === target) return true;
      if (!s.startsWith(target + ' ') && !s.startsWith(target + ':'))
        return false;
      // The subject must stay inside the selected subtree. A sibling of a
      // descendant is safe, but a sibling of the target itself is outside it.
      const suffix = selectorParser().astSync('x' + s.slice(target.length));
      const firstCombinator = suffix.first.nodes.find(
        (n) => n.type === 'combinator',
      );
      return (
        !firstCombinator || ['', '>'].includes(firstCombinator.value.trim())
      );
    });
    const ancestors: string[] = [];
    let parent = rule.parent;
    while (parent?.type === 'atrule') {
      ancestors.unshift(parent.params);
      parent = parent.parent;
    }
    if (!selected)
      result.push(
        JSON.stringify([
          ancestors,
          rule.selectors,
          rule.nodes.map((n) =>
            n.type === 'decl' ? [n.prop, n.value, n.important] : n.type,
          ),
        ]),
      );
  });
  return JSON.stringify(result);
}
