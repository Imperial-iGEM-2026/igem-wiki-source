// A separate, editable Notebook variant. Regenerate after changing the base template.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import postcss from 'postcss';
const data = JSON.parse(await readFile('app/template-data.json', 'utf8'));
const themes = JSON.parse(await readFile('app/template-styles.json', 'utf8'));
const id = 'notebook-purple';
const template = structuredClone(data.regelerate);
template.id = id;
template.name = 'reGELerate · Notebook Purple';
let count = 0;
const node = (t, a = {}, ...c) => ({ t, a, c: c.flat() });
const text = (value) => {
  const f = `template:purple:text${++count}`;
  template.fields[f] = value;
  return { f };
};
const p = (value, className = '') =>
  node('p', { class: className }, text(value));
const h = (value) => node('h2', {}, text(value));
const link = (label, href) =>
  node('a', { href, class: 'text-button' }, text(label));
const iconPaths = {
  people:
    'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 22v-3a6 6 0 0 1 12 0v3M17 5a4 4 0 0 1 0 8m1 3a5 5 0 0 1 4 5',
  flask: 'M8 2h8M10 2v8L3 21q-1 2 2 2h14q3 0 2-2L14 10V2M7 16h10',
  note: 'M5 2h14v21H5zM2 6h5M2 12h5M2 18h5M10 7h5m-5 5h5m-5 5h3',
  spark: 'M12 1l3 8 8 3-8 3-3 8-3-8-8-3 8-3z',
};
const icon = (kind) =>
  node(
    'svg',
    {
      viewbox: '0 0 26 26',
      class: 'purple-icon',
      'aria-hidden': 'true',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.4',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    node('path', { d: iconPaths[kind] || iconPaths.note }),
  );
const note = (title, body, kind = 'note') =>
  node(
    'details',
    { class: 'purple-note' },
    node(
      'summary',
      {},
      icon(kind),
      node('span', {}, text(title)),
      node('span', { class: 'purple-plus', 'aria-hidden': 'true' }, '+'),
    ),
    node('div', { class: 'purple-note-body' }, p(body)),
  );
const section = (title, body, ...children) =>
  node(
    'section',
    { class: 'purple-page-section' },
    h(title),
    p(body, 'purple-lead'),
    children,
  );
function recolour(value) {
  return value.replace(
    /#([\da-f]{6}|[\da-f]{3})(?![\da-f])/gi,
    (original, hex) => {
      if (hex.length === 3) hex = [...hex].map((v) => v + v).join('');
      const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      if (Math.max(...rgb) - Math.min(...rgb) < 12) return original;
      const light = (Math.max(...rgb) + Math.min(...rgb)) / 2;
      return light < 75
        ? '#362545'
        : light < 140
          ? '#74518e'
          : light < 185
            ? '#aa85da'
            : light < 222
              ? '#dbcaf2'
              : '#f2ebfa';
    },
  );
}
function walk(n, scientific = false) {
  if (!n || typeof n !== 'object' || !n.t) return;
  scientific ||= (n.a.class || '').includes('readouts');
  if (scientific && n.t === 'svg') return;
  for (const [key, value] of Object.entries(n.a)) {
    if (key === 'src' && value.includes('regelerate-logo'))
      n.a[key] = '/templates/notebook-purple/logo-transparent.png';
    if (['fill', 'stroke', 'style'].includes(key)) n.a[key] = recolour(value);
  }
  n.c.forEach((child) => walk(child, scientific));
}
for (const page of template.pages) page.layers.forEach((l) => walk(l.ast));
const home = template.pages.find((page) => page.slug === 'home');
Object.assign(template.fields, {
  'template:home:text1': 'IMPERIAL iGEM / AN OPEN SCIENCE NOTEBOOK',
  'template:home:text2': 'Small proteins.',
  'template:home:text3': 'Big ',
  'template:home:text4': 'possibilities.',
  'template:home:text5':
    'Could tiny building blocks make a material that puts itself back together? We’re opening our notebook to find out.',
  'template:home:text7': 'Explore the idea ',
  'template:home:text9': 'a little curiosity. a lot of connections.',
});
const hero = home.layers.find((l) => l.ast.a?.class === 'hero').ast;
const copy = hero.c.find((n) => n.a?.class === 'hero-copy');
copy.c.push(
  node(
    'div',
    { class: 'purple-hero-links' },
    link('Meet the people behind the questions ↗', '/human-practices'),
  ),
);
const art = hero.c.find((n) => n.a?.class === 'hero-art');
art.c.unshift(
  node(
    'div',
    { class: 'purple-logo-stamp' },
    node('img', {
      src: '/templates/notebook-purple/logo-transparent.png',
      alt: 'reGELerate purple protein network logo',
      width: '120',
      height: '135',
    }),
  ),
);
const discovery = section(
  'Good science starts with a good question.',
  'Follow a thread through our notebook. Open the notes, explore the evidence, and see where the people we meet take the project.',
  node(
    'div',
    { class: 'purple-discovery' },
    node(
      'article',
      {},
      icon('flask'),
      node('h3', {}, text('Make. Test. Learn.')),
      p('From a design on paper to a question we can test.'),
      link('Inside the lab ↗', '/engineering'),
    ),
    node(
      'article',
      {},
      icon('people'),
      node('h3', {}, text('Listen, then rethink.')),
      p('A useful material begins with the people who might use it.'),
      link('Our listening journey ↗', '/human-practices'),
    ),
    node(
      'article',
      {},
      icon('spark'),
      node('h3', {}, text('Stay curious.')),
      p('Small explanations for some very big molecular ideas.'),
      link('Explore together ↗', '/education'),
    ),
  ),
  note(
    'Is this already a self-healing material?',
    'Self-healing is a research ambition. A network in an illustration is not evidence of material performance. Visit Results for the team’s measured observations and limitations.',
    'flask',
  ),
);
discovery.a.id = 'open-notebook';
discovery.a.class += ' section';
home.layers.splice(2, 0, {
  id: 'purple-discovery',
  label: 'Open our notebook',
  region: 'main',
  ast: discovery,
});
const topics = {
  description: [
    'The question behind the gel',
    'What are we trying to build?',
    'Explain the need, the proposed protein material and how you will judge whether it works.',
    'What makes a protein network a gel?',
    'Connections alone are not enough. Material behaviour needs measurements under clearly stated conditions.',
    'Where can this idea go?',
    'Compare possible uses with their requirements; separate a future application from a demonstrated result.',
  ],
  design: [
    'A design you can take apart',
    '01 / Choose the building blocks',
    'Record each component, its proposed role and the evidence behind the choice.',
    '02 / Connect the pieces',
    'Sketch how fibres and connecting components could form a network. Record alternative designs and their trade-offs.',
    '03 / Define success',
    'Choose measurable criteria before testing. Include the controls that could challenge your explanation.',
  ],
  engineering: [
    'The loop that moves us forward',
    'Design → what should change?',
    'Record the hypothesis, design version and the outcome you expect.',
    'Build & test → what happened?',
    'Link to the actual protocol, controls and observations. Keep unsuccessful attempts visible.',
    'Learn → what happens next?',
    'Explain what the evidence changed, what remains uncertain and why the next iteration follows.',
  ],
  experiments: [
    'Behind each observation',
    'Question & controls',
    'Add the experimental question, control groups and variables before presenting outcomes.',
    'Method & provenance',
    'Link the approved protocol, sample identifiers and notebook entry so the work can be traced.',
    'Observation & interpretation',
    'Keep measured observations separate from explanations; include replicates and uncertainty.',
  ],
  protocols: [
    'A method worth sharing',
    'Before you begin',
    'Add prerequisites, approved risk assessments, materials and the current protocol version.',
    'Open the method',
    'Replace this note with the team’s reviewed method or a link to the approved protocol document.',
    'Check & troubleshoot',
    'Record acceptance criteria, known limitations and the changes made between protocol versions.',
  ],
  results: [
    'What the evidence says',
    'What did we measure?',
    'Add labelled figures, units, controls and sample sizes. Do not replace missing data with illustrative numbers.',
    'What can we conclude?',
    'Connect each conclusion to evidence and distinguish supported results from a working hypothesis.',
    'What is still unresolved?',
    'Discuss uncertainty, negative results and the next experiment that could clarify them.',
  ],
  model: [
    'Think with a model',
    'Open the assumptions',
    'Record what the model includes, what it leaves out and the conditions under which it is useful.',
    'Explore a parameter',
    'Add your validated model or a labelled interactive figure here. Show units and the domain in which predictions are meaningful.',
    'Compare with reality',
    'Link predictions to measurements and explain disagreements. A conceptual sketch is not a quantitative simulation.',
  ],
  software: [
    'Tools with a purpose',
    'What problem does the tool solve?',
    'Introduce the intended user and the task the software supports.',
    'Try a worked example',
    'Add a reproducible example with expected outputs and a link to the versioned source.',
    'Understand the limits',
    'Document input assumptions, validation tests, dependencies and known limitations.',
  ],
  education: [
    'A small field guide to big ideas',
    'What is a protein?',
    'Proteins are chains of amino acids. Their structures and interactions help determine what they do.',
    'What is a hydrogel?',
    'A hydrogel is a network that holds water. Its properties depend on its components, connections and conditions.',
    'Does prion-like mean infectious?',
    'Not necessarily. Prion-like describes particular sequence or assembly features; it does not itself establish infectivity or safety. Assess each material and experiment on its own evidence.',
  ],
  implementation: [
    'From the bench to the world',
    'Who might use it?',
    'Identify a specific setting and user need, then document the evidence for that need.',
    'What would have to be true?',
    'Record performance requirements, practical constraints and the checks needed before real-world use.',
    'What stands in the way?',
    'Explain remaining technical, manufacturing and adoption barriers without presenting proposed uses as validated.',
  ],
  sustainability: [
    'Ask about the whole life cycle',
    'Where does it come from?',
    'Map inputs, production requirements and the boundaries of the assessment.',
    'What happens during use?',
    'Compare realistic use scenarios, durability and resource requirements using traceable evidence.',
    'Where does it go next?',
    'Record end-of-life assumptions and uncertainty. Bio-based does not automatically mean sustainable.',
  ],
  safety: [
    'Care is part of the design',
    'People & laboratory',
    'Link the team’s approved risk assessments, training and responsible contacts.',
    'Material & environment',
    'Describe the specific biological materials, containment and disposal decisions using your reviewed documentation.',
    'Uncertainties & oversight',
    'Record unresolved questions and the advice or review needed before further work.',
  ],
  notebook: [
    'The story between the results',
    'Plan / dated entry',
    'Add a date, author, objective and links to the relevant design or protocol.',
    'Observe / dated entry',
    'Record what happened, including unexpected outcomes and the location of original records.',
    'Reflect / dated entry',
    'Explain what you learned and the next decision. Duplicate these notes for each new entry.',
  ],
  parts: [
    'Meet the building blocks',
    'Identity & intended role',
    'Add registry identifiers, construct versions and each part’s purpose.',
    'Characterisation',
    'Link the measurements and controls used to characterise each part.',
    'Reuse & limitations',
    'Describe compatible contexts, known limitations and where others can find the documentation.',
  ],
  contribution: [
    'Leave something useful behind',
    'What can another team reuse?',
    'Identify the resource, part, dataset or method you are sharing.',
    'How can they use it?',
    'Include a worked example, version, licence and a stable source link.',
    'What did you validate?',
    'Show the evidence for the contribution and explain its limitations.',
  ],
  members: [
    'The people holding the notebook',
    'Meet the team',
    'Add approved names, portraits, roles and the questions that motivate each member.',
    'How we work together',
    'Explain how work, feedback and decisions move across the team.',
    'Beyond the lab',
    'Share a team story or moment of learning with permission from everyone involved.',
  ],
  attributions: [
    'Give every contribution its place',
    'Who did what?',
    'Describe individual contributions clearly and use the required iGEM attribution format.',
    'Advice & external support',
    'Distinguish team work from work or guidance provided by advisors and collaborators.',
    'Sources & permissions',
    'Record permissions, licences and acknowledgements for reused material.',
  ],
  sponsors: [
    'The support behind the science',
    'How did each supporter help?',
    'Record funding, equipment, advice or in-kind support accurately.',
    'Acknowledgements & permissions',
    'Use approved logos and wording; confirm permission before publishing.',
    'Stay in touch',
    'Add the team’s approved contact route for future collaboration.',
  ],
};
for (const page of template.pages) {
  if (page.slug === 'home') continue;
  const heading = page.layers.find(
    (l) => l.ast.a?.class === 'page-heading',
  )?.ast;
  if (heading)
    heading.c = heading.c.filter((n) => n.a?.class !== 'page-status');
  const content = page.layers.find(
    (l) => l.ast.a?.class === 'wiki-content',
  )?.ast;
  const article = content?.c.find((n) => n.t === 'article');
  if (!article) continue;
  if (page.slug === 'human-practices') {
    article.c = [
      p('PEOPLE → PERSPECTIVES → BETTER DECISIONS', 'purple-kicker'),
      section(
        'A listening journey, not a tick box.',
        'Good questions change when you share them. Follow how a conversation can become a design decision.',
        p(
          'Timeline template · Add your real dates, participants and consented notes. These stages are prompts, not completed interviews.',
          'purple-draft',
        ),
        node(
          'div',
          { class: 'purple-timeline' },
          ...[
            [
              '01',
              'Map the people',
              'Who should be part of the conversation?',
              'Add date · stakeholder group · reason for engaging. Consider potential users, researchers and people affected by the material’s life cycle.',
            ],
            [
              '02',
              'Listen with care',
              'What matters from their perspective?',
              'Add consented interview notes, questions and the participant’s context. Link approved sources; avoid publishing private information.',
            ],
            [
              '03',
              'Rethink the design',
              'What did their input actually change?',
              'Record the feedback, the decision it informed and a link to the design iteration. Explain when advice was not adopted.',
            ],
            [
              '04',
              'Close the loop',
              'Did we understand them correctly?',
              'Record follow-up feedback, remaining disagreements and what you will revisit. Add the next conversation rather than implying the work is finished.',
            ],
          ].map(([n, title, question, body]) =>
            node(
              'details',
              { class: 'purple-timeline-entry' },
              node(
                'summary',
                {},
                node('span', { class: 'purple-step' }, n),
                node(
                  'span',
                  {},
                  node('small', {}, text('ADD DATE / STAKEHOLDER')),
                  node('strong', {}, text(title)),
                  node('span', { class: 'purple-question' }, text(question)),
                ),
                node(
                  'span',
                  { class: 'purple-plus', 'aria-hidden': 'true' },
                  '+',
                ),
              ),
              node(
                'div',
                { class: 'purple-timeline-body' },
                p(body),
                node(
                  'div',
                  { class: 'purple-feedback' },
                  p('WE HEARD', 'purple-kicker'),
                  p('Add a consented insight.'),
                  p('WE CHANGED', 'purple-kicker'),
                  p('Link the specific project decision and its evidence.'),
                ),
              ),
            ),
          ),
        ),
      ),
      section(
        'Make the connection visible.',
        'Every insight deserves a traceable response.',
        note(
          'From a conversation to an engineering decision',
          'Use this space to connect a stakeholder need to the requirement, experiment and decision it informed. Link to Engineering and show how you checked the response.',
          'people',
        ),
        link('Follow the engineering loop ↗', '/engineering'),
      ),
    ];
  } else {
    const [title, ...pairs] = topics[page.slug];
    const notes = section(
      title,
      'Open a notebook entry to explore the question. Replace the prompts with your team’s evidence and story.',
      ...[0, 2, 4].map((i) =>
        note(
          pairs[i],
          pairs[i + 1],
          page.slug === 'members' ? 'people' : i === 0 ? 'flask' : 'note',
        ),
      ),
    );
    if (page.slug === 'education')
      notes.c[1] = p(
        'A few ideas to explore together. Open a question, then follow the science.',
        'purple-lead',
      );
    if (page.slug === 'sponsors') article.c.push(notes);
    else
      article.c = [
        p('OPEN NOTEBOOK / ADD YOUR TEAM’S EVIDENCE', 'purple-kicker'),
        notes,
        node(
          'aside',
          { class: 'purple-margin-note' },
          icon('spark'),
          p(
            'A note to our future selves: show what we learned, not just what worked.',
          ),
        ),
      ];
  }
}
const modelArticle = template.pages
  .find((page) => page.slug === 'model')
  .layers.find((l) => l.ast.a?.class === 'wiki-content')
  .ast.c.find((n) => n.t === 'article');
const points = [
  [70, 110],
  [175, 45],
  [175, 175],
  [280, 110],
  [385, 45],
  [385, 175],
];
const edges = [
  [0, 1],
  [1, 3],
  [3, 4],
  [0, 2],
  [2, 3],
  [3, 5],
];
modelArticle.c.splice(
  1,
  0,
  section(
    'A network you can play with.',
    'Move the slider to add connections between the illustrated nodes. This is a conceptual drawing, not a prediction of gel strength, self-healing or experimental behaviour.',
    node(
      'div',
      { class: 'purple-network', 'data-purple-network': '' },
      node(
        'svg',
        {
          viewbox: '0 0 455 220',
          role: 'img',
          'aria-label':
            'Conceptual protein network with adjustable connecting lines',
        },
        ...edges.map(([a, b]) =>
          node('path', {
            d: `M${points[a][0]} ${points[a][1]} Q${(points[a][0] + points[b][0]) / 2} ${(points[a][1] + points[b][1]) / 2 + 12} ${points[b][0]} ${points[b][1]}`,
            'data-network-edge': '',
            stroke: '#aa85da',
            'stroke-width': '5',
            fill: 'none',
            'stroke-linecap': 'round',
          }),
        ),
        ...points.map(([x, y]) =>
          node('circle', {
            cx: String(x),
            cy: String(y),
            r: '15',
            fill: '#8b4dff',
            stroke: '#e2d2f6',
            'stroke-width': '5',
          }),
        ),
      ),
      node(
        'label',
        {},
        text('Connections in this sketch'),
        node('input', {
          type: 'range',
          min: '0',
          max: '6',
          step: '1',
          defaultValue: '3',
          'aria-label': 'Connections in this sketch',
        }),
      ),
      node(
        'output',
        { 'aria-live': 'polite', 'data-network-count': '' },
        '3 / 6',
      ),
      p('ILLUSTRATION ONLY · NO PHYSICAL UNITS', 'purple-kicker'),
    ),
  ),
);
// Fields remain editable, including every new note and timeline entry.
data[id] = template;
const scope = `[data-template-theme="${id}"]`;
const extra = postcss.parse(
  await readFile('template-sources/notebook-purple/theme.css', 'utf8'),
);
extra.walkRules((rule) => {
  if (rule.parent.type === 'atrule' && /keyframes/.test(rule.parent.name))
    return;
  rule.selectors = rule.selectors.map((s) =>
    s.startsWith(':root') ? s.replace(':root', scope) : `${scope} ${s}`,
  );
});
themes[id] =
  recolour(
    themes.regelerate
      .replaceAll(
        'data-template-theme="regelerate"',
        `data-template-theme="${id}"`,
      )
      .replaceAll(
        "data-template-theme='regelerate'",
        `data-template-theme='${id}'`,
      ),
  ) +
  '\n' +
  extra;
await mkdir('public/templates/notebook-purple', { recursive: true });
await copyFile(
  'template-sources/notebook-purple/logo-transparent.png',
  'public/templates/notebook-purple/logo-transparent.png',
);
await writeFile('app/template-data.json', JSON.stringify(data));
await writeFile('app/template-styles.json', JSON.stringify(themes));
console.log(
  `Built ${template.name}: ${template.pages.length} pages, ${count} new editable fields.`,
);
