// Shared by the offline compiler and the server's two-ZIP handoff.
// This version must match the pinned pdfjs-dist dependency.
export const PDF_WORKER_SOURCE = '/templates/runtime/pdfjs-6.4.299-worker.js';
// Tab icons use the same source in the editor, preview and published HTML.
export function siteIcon(values) {
  let logo;
  try {
    logo = JSON.parse(values['site:header'] || '{}').logo;
  } catch {}
  if (
    typeof logo === 'string' &&
    /^(?:https:\/\/|\/(?!\/))/.test(logo) &&
    !/[<>"\s]/.test(logo)
  )
    return logo;
  return values['site:template'] && values['site:template'] !== 'blank'
    ? '/templates/notebook-purple/favicon.svg'
    : '/templates/notebook-purple/studio-icon.svg';
}

export function exportMedia(
  values,
  template,
  expandLayers = (layers) => layers,
  locations = new Map(),
) {
  const refs = new Map();
  const pageTitles = new Map(
    [
      ...(template?.pages || []),
      ...JSON.parse(values['pages:custom'] || '[]'),
    ].map((page) => [page.slug, page.title || page.slug]),
  );
  const add = (source, kind, location) => {
    refs.set(source, kind);
    const entries = locations.get(source) || [];
    if (
      !entries.some(
        (entry) => JSON.stringify(entry) === JSON.stringify(location),
      )
    )
      entries.push(location);
    locations.set(source, entries);
  };
  const at = (page, node, field) => ({
    page,
    pageTitle: pageTitles.get(page) || (page === 'home' ? 'Home' : page),
    layerId: node?.id,
    layerName:
      node?.name ||
      node?.title ||
      node?.label ||
      node?.kind ||
      'Template element',
    field,
  });
  if (!template)
    add('/prion-hero.png', 'image', at('home', { name: 'Hero' }, 'Image'));
  add(siteIcon(values), 'image', {
    pageTitle: 'Site settings',
    layerName: 'Tab icon',
    field: 'Image',
  });
  for (const font of templateFonts(values))
    add(font.source, 'font', {
      pageTitle: 'Template styles',
      layerName: font.family,
      field: 'Font',
    });
  const removed = new Set(JSON.parse(values['pages:removed'] || '[]'));
  const visible = (node, nodes) => {
    const visited = new Set();
    while (node && !visited.has(node.id)) {
      if (node.hidden) return false;
      visited.add(node.id);
      node = nodes.find((parent) => parent.id === node.parentId);
    }
    return true;
  };
  const copies = JSON.parse(values['pages:custom'] || '[]').flatMap((copy) => {
    const original =
      template &&
      copy.sourceTemplate === template.id &&
      template.pages.find((page) => page.slug === copy.sourcePage);
    return original
      ? [{ ...original, slug: copy.slug, title: copy.title }]
      : [];
  });
  for (const page of [...(template?.pages || []), ...copies]) {
    if (removed.has(page.slug)) continue;
    const nodes = JSON.parse(
      values['layout:' + page.slug] || '{"nodes":[]}',
    ).nodes;
    for (const layer of expandLayers(page.layers)) {
      const saved = nodes.find((node) => node.id === layer.id);
      if (!visible(saved || { id: layer.id, ...layer.defaults }, nodes))
        continue;
      if (layer.sponsorSlot && saved?.src) {
        add(
          saved.src,
          'image',
          at(page.slug, { ...layer, ...saved }, 'Image source'),
        );
        continue;
      }
      const collect = (node) => {
        if (!node || typeof node === 'string') return;
        const src = node.a?.src;
        if (src)
          add(
            src,
            ['audio', 'video', 'iframe'].includes(node.t)
              ? node.t === 'iframe'
                ? 'embed'
                : node.t
              : 'image',
            at(page.slug, { ...layer, ...saved }, node.t + ' source'),
          );
        if (node.a?.poster)
          add(
            node.a.poster,
            'image',
            at(page.slug, { ...layer, ...saved }, 'Video poster'),
          );
        node.c?.forEach(collect);
      };
      collect(layer.ast);
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith('layout:') || removed.has(key.slice(7))) continue;
    const { nodes } = JSON.parse(value);
    for (const node of nodes) {
      if (!visible(node, nodes)) continue;
      if (node.src)
        add(node.src, node.kind, at(key.slice(7), node, 'Media source'));
      if (node.kind === 'html') {
        const code = [node.html, node.css, node.javascript]
          .filter(Boolean)
          .join('\n');
        // Explicit local asset references in snippets participate in the normal export mapping.
        for (const [source] of code.matchAll(
          /\/api\/media\/[a-f0-9-]+\.[a-z0-9]+|\/templates\/[a-zA-Z0-9_./-]+/g,
        )) {
          if (source.includes('..')) continue;
          add(
            source,
            /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(source)
              ? 'video'
              : /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(source)
                ? 'audio'
                : 'image',
            at(key.slice(7), node, 'Custom HTML / CSS / JavaScript'),
          );
        }
      }
    }
  }
  const header = JSON.parse(values['site:header'] || '{}');
  if (header.loading?.enabled && header.loading.image)
    add(header.loading.image, 'image', { pageTitle: 'Site settings', layerName: 'Loading animation', field: 'Image source' });
  const logo = header.logo;
  if (logo)
    add(logo, 'image', {
      pageTitle: 'Site settings',
      layerName: 'Header logo',
      field: 'Image source',
    });
  return refs;
}

// Fixed folder names keep live and offline handoffs consistent and path-safe.
export function mediaFolder(source, kind, values = {}) {
  if (kind === 'runtime') return 'runtime';
  if (kind === 'font') return 'fonts';
  if (kind === 'audio') return 'audio';
  if (kind === 'video' || kind === 'embed') return 'videos';
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(source, 'https://export.invalid').pathname,
    ).toLowerCase();
  } catch {
    pathname = String(source).split(/[?#]/)[0].toLowerCase();
  }
  if (kind === 'model' || /\.(glb|gltf|obj|stl|ply)$/.test(pathname))
    return 'models';
  if (/\.(woff2?|ttf|otf)$/.test(pathname)) return 'fonts';
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip)$/.test(pathname))
    return 'documents';
  let logo;
  try {
    logo = JSON.parse(values['site:header'] || '{}').logo;
  } catch {}
  if (
    source === logo ||
    /(?:^|[/_.-])(?:logos?|sponsors?)(?:[/_.-]|$)/.test(pathname)
  )
    return 'logos';
  if (/(?:^|[/_.-])(?:icons?|favicon)(?:[/_.-]|$)/.test(pathname))
    return 'icons';
  if (/(?:^|[/_.-])(?:banners?|hero|covers?)(?:[/_.-]|$)/.test(pathname))
    return 'banners';
  return 'images';
}

export const bundledFonts = [
  {
    source: '/templates/fonts/dmsans-DMSans-opsz-wght.ttf',
    family: 'DM Sans',
    weight: '100 1000',
    style: 'normal',
    license: 'dmsans',
  },
  {
    source: '/templates/fonts/dmsans-DMSans-Italic-opsz-wght.ttf',
    family: 'DM Sans',
    weight: '100 1000',
    style: 'italic',
    license: 'dmsans',
  },
  {
    source: '/templates/fonts/caveat-Caveat-wght.ttf',
    family: 'Caveat',
    weight: '400 700',
    style: 'normal',
    license: 'caveat',
  },
  {
    source:
      '/templates/fonts/librecaslondisplay-LibreCaslonDisplay-Regular.ttf',
    family: 'Libre Caslon Display',
    weight: '400',
    style: 'normal',
    license: 'librecaslondisplay',
  },
];
export const fontLicenses = {
  dmsans:
    'Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts)\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\nThis license is copied below, and is also available with a FAQ at:\nhttps://scripts.sil.org/OFL\n\n\n-----------------------------------------------------------\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n-----------------------------------------------------------\n\nPREAMBLE\nThe goals of the Open Font License (OFL) are to stimulate worldwide\ndevelopment of collaborative font projects, to support the font creation\nefforts of academic and linguistic communities, and to provide a free and\nopen framework in which fonts may be shared and improved in partnership\nwith others.\n\nThe OFL allows the licensed fonts to be used, studied, modified and\nredistributed freely as long as they are not sold by themselves. The\nfonts, including any derivative works, can be bundled, embedded, \nredistributed and/or sold with any software provided that any reserved\nnames are not used by derivative works. The fonts and derivatives,\nhowever, cannot be released under any other type of license. The\nrequirement for fonts to remain under this license does not apply\nto any document created using the fonts or their derivatives.\n\nDEFINITIONS\n"Font Software" refers to the set of files released by the Copyright\nHolder(s) under this license and clearly marked as such. This may\ninclude source files, build scripts and documentation.\n\n"Reserved Font Name" refers to any names specified as such after the\ncopyright statement(s).\n\n"Original Version" refers to the collection of Font Software components as\ndistributed by the Copyright Holder(s).\n\n"Modified Version" refers to any derivative made by adding to, deleting,\nor substituting -- in part or in whole -- any of the components of the\nOriginal Version, by changing formats or by porting the Font Software to a\nnew environment.\n\n"Author" refers to any designer, engineer, programmer, technical\nwriter or other person who contributed to the Font Software.\n\nPERMISSION & CONDITIONS\nPermission is hereby granted, free of charge, to any person obtaining\na copy of the Font Software, to use, study, copy, merge, embed, modify,\nredistribute, and sell modified and unmodified copies of the Font\nSoftware, subject to the following conditions:\n\n1) Neither the Font Software nor any of its individual components,\nin Original or Modified Versions, may be sold by itself.\n\n2) Original or Modified Versions of the Font Software may be bundled,\nredistributed and/or sold with any software, provided that each copy\ncontains the above copyright notice and this license. These can be\nincluded either as stand-alone text files, human-readable headers or\nin the appropriate machine-readable metadata fields within text or\nbinary files as long as those fields can be easily viewed by the user.\n\n3) No Modified Version of the Font Software may use the Reserved Font\nName(s) unless explicit written permission is granted by the corresponding\nCopyright Holder. This restriction only applies to the primary font name as\npresented to the users.\n\n4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font\nSoftware shall not be used to promote, endorse or advertise any\nModified Version, except to acknowledge the contribution(s) of the\nCopyright Holder(s) and the Author(s) or with their explicit written\npermission.\n\n5) The Font Software, modified or unmodified, in part or in whole,\nmust be distributed entirely under this license, and must not be\ndistributed under any other license. The requirement for fonts to\nremain under this license does not apply to any document created\nusing the Font Software.\n\nTERMINATION\nThis license becomes null and void if any of the above conditions are\nnot met.\n\nDISCLAIMER\nTHE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT\nOF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE\nCOPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,\nINCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL\nDAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\nFROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM\nOTHER DEALINGS IN THE FONT SOFTWARE.\n',
  caveat:
    'Copyright 2014 The Caveat Project Authors (https://github.com/googlefonts/caveat)\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\nThis license is copied below, and is also available with a FAQ at:\nhttp://scripts.sil.org/OFL\n\n\n-----------------------------------------------------------\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n-----------------------------------------------------------\n\nPREAMBLE\nThe goals of the Open Font License (OFL) are to stimulate worldwide\ndevelopment of collaborative font projects, to support the font creation\nefforts of academic and linguistic communities, and to provide a free and\nopen framework in which fonts may be shared and improved in partnership\nwith others.\n\nThe OFL allows the licensed fonts to be used, studied, modified and\nredistributed freely as long as they are not sold by themselves. The\nfonts, including any derivative works, can be bundled, embedded, \nredistributed and/or sold with any software provided that any reserved\nnames are not used by derivative works. The fonts and derivatives,\nhowever, cannot be released under any other type of license. The\nrequirement for fonts to remain under this license does not apply\nto any document created using the fonts or their derivatives.\n\nDEFINITIONS\n"Font Software" refers to the set of files released by the Copyright\nHolder(s) under this license and clearly marked as such. This may\ninclude source files, build scripts and documentation.\n\n"Reserved Font Name" refers to any names specified as such after the\ncopyright statement(s).\n\n"Original Version" refers to the collection of Font Software components as\ndistributed by the Copyright Holder(s).\n\n"Modified Version" refers to any derivative made by adding to, deleting,\nor substituting -- in part or in whole -- any of the components of the\nOriginal Version, by changing formats or by porting the Font Software to a\nnew environment.\n\n"Author" refers to any designer, engineer, programmer, technical\nwriter or other person who contributed to the Font Software.\n\nPERMISSION & CONDITIONS\nPermission is hereby granted, free of charge, to any person obtaining\na copy of the Font Software, to use, study, copy, merge, embed, modify,\nredistribute, and sell modified and unmodified copies of the Font\nSoftware, subject to the following conditions:\n\n1) Neither the Font Software nor any of its individual components,\nin Original or Modified Versions, may be sold by itself.\n\n2) Original or Modified Versions of the Font Software may be bundled,\nredistributed and/or sold with any software, provided that each copy\ncontains the above copyright notice and this license. These can be\nincluded either as stand-alone text files, human-readable headers or\nin the appropriate machine-readable metadata fields within text or\nbinary files as long as those fields can be easily viewed by the user.\n\n3) No Modified Version of the Font Software may use the Reserved Font\nName(s) unless explicit written permission is granted by the corresponding\nCopyright Holder. This restriction only applies to the primary font name as\npresented to the users.\n\n4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font\nSoftware shall not be used to promote, endorse or advertise any\nModified Version, except to acknowledge the contribution(s) of the\nCopyright Holder(s) and the Author(s) or with their explicit written\npermission.\n\n5) The Font Software, modified or unmodified, in part or in whole,\nmust be distributed entirely under this license, and must not be\ndistributed under any other license. The requirement for fonts to\nremain under this license does not apply to any document created\nusing the Font Software.\n\nTERMINATION\nThis license becomes null and void if any of the above conditions are\nnot met.\n\nDISCLAIMER\nTHE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT\nOF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE\nCOPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,\nINCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL\nDAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\nFROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM\nOTHER DEALINGS IN THE FONT SOFTWARE.\n',
  librecaslondisplay:
    'Copyright 2012 The Libre Caslon Display Authors (https://github.com/impallari/Libre-Caslon-Display)\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\nThis license is copied below, and is also available with a FAQ at:\nhttp://scripts.sil.org/OFL\n\n\n-----------------------------------------------------------\nSIL OPEN FONT LICENSE Version 1.1 - 26 February 2007\n-----------------------------------------------------------\n\nPREAMBLE\nThe goals of the Open Font License (OFL) are to stimulate worldwide\ndevelopment of collaborative font projects, to support the font creation\nefforts of academic and linguistic communities, and to provide a free and\nopen framework in which fonts may be shared and improved in partnership\nwith others.\n\nThe OFL allows the licensed fonts to be used, studied, modified and\nredistributed freely as long as they are not sold by themselves. The\nfonts, including any derivative works, can be bundled, embedded, \nredistributed and/or sold with any software provided that any reserved\nnames are not used by derivative works. The fonts and derivatives,\nhowever, cannot be released under any other type of license. The\nrequirement for fonts to remain under this license does not apply\nto any document created using the fonts or their derivatives.\n\nDEFINITIONS\n"Font Software" refers to the set of files released by the Copyright\nHolder(s) under this license and clearly marked as such. This may\ninclude source files, build scripts and documentation.\n\n"Reserved Font Name" refers to any names specified as such after the\ncopyright statement(s).\n\n"Original Version" refers to the collection of Font Software components as\ndistributed by the Copyright Holder(s).\n\n"Modified Version" refers to any derivative made by adding to, deleting,\nor substituting -- in part or in whole -- any of the components of the\nOriginal Version, by changing formats or by porting the Font Software to a\nnew environment.\n\n"Author" refers to any designer, engineer, programmer, technical\nwriter or other person who contributed to the Font Software.\n\nPERMISSION & CONDITIONS\nPermission is hereby granted, free of charge, to any person obtaining\na copy of the Font Software, to use, study, copy, merge, embed, modify,\nredistribute, and sell modified and unmodified copies of the Font\nSoftware, subject to the following conditions:\n\n1) Neither the Font Software nor any of its individual components,\nin Original or Modified Versions, may be sold by itself.\n\n2) Original or Modified Versions of the Font Software may be bundled,\nredistributed and/or sold with any software, provided that each copy\ncontains the above copyright notice and this license. These can be\nincluded either as stand-alone text files, human-readable headers or\nin the appropriate machine-readable metadata fields within text or\nbinary files as long as those fields can be easily viewed by the user.\n\n3) No Modified Version of the Font Software may use the Reserved Font\nName(s) unless explicit written permission is granted by the corresponding\nCopyright Holder. This restriction only applies to the primary font name as\npresented to the users.\n\n4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font\nSoftware shall not be used to promote, endorse or advertise any\nModified Version, except to acknowledge the contribution(s) of the\nCopyright Holder(s) and the Author(s) or with their explicit written\npermission.\n\n5) The Font Software, modified or unmodified, in part or in whole,\nmust be distributed entirely under this license, and must not be\ndistributed under any other license. The requirement for fonts to\nremain under this license does not apply to any document created\nusing the Font Software.\n\nTERMINATION\nThis license becomes null and void if any of the above conditions are\nnot met.\n\nDISCLAIMER\nTHE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,\nEXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF\nMERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT\nOF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE\nCOPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,\nINCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL\nDAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING\nFROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM\nOTHER DEALINGS IN THE FONT SOFTWARE.\n',
};
// Only audited, redistributable fonts are bundled. Device fonts remain fallbacks.
export function templateFonts(values) {
  const theme = values['site:template'];
  const saved = Object.entries(values)
    .filter(
      ([key]) =>
        key.startsWith('layout:') ||
        key.startsWith('css:') ||
        key === 'site:header',
    )
    .map(([, value]) => value)
    .join(' ');
  return bundledFonts.filter(
    (font) =>
      ['regelerate', 'notebook-purple', 'notebook-white'].includes(theme) ||
      ['regelerate', 'notebook-purple', 'notebook-white'].includes(
        values['site:appearance'],
      ) ||
      (theme === 'swiss' && font.family === 'Caveat') ||
      saved.includes(font.family),
  );
}
export function templateFontCss(values, map) {
  const fonts = templateFonts(values).filter((font) => map[font.source]);
  if (!fonts.length) return '';
  const notices = [...new Set(fonts.map((font) => font.license))]
    .map((key) => '/* ' + fontLicenses[key] + ' */')
    .join('\n');
  return (
    notices +
    '\n' +
    fonts
      .map(
        (font) =>
          `@font-face{font-family:${JSON.stringify(font.family)};font-style:${font.style};font-weight:${font.weight};font-display:swap;src:url(${JSON.stringify(map[font.source])}) format("truetype");}`,
      )
      .join('\n')
  );
}
