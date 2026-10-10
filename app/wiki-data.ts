export type WikiSection = { id: string; title: string; prompt: string };
export type WikiPage = {
  slug: string;
  title: string;
  group: string;
  summary: string;
  status:
    | 'Core documentation'
    | 'Medal documentation'
    | 'Optional award'
    | 'Submission guide';
  sections: WikiSection[];
  source?: string;
};
const section = (title: string, prompt: string): WikiSection => ({
  id: title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-$/, ''),
  title,
  prompt,
});
const page = (
  slug: string,
  title: string,
  group: string,
  summary: string,
  status: WikiPage['status'],
  entries: [string, string][],
  source?: string,
): WikiPage => ({
  slug,
  title,
  group,
  summary,
  status,
  sections: entries.map(([t, p]) => section(t, p)),
  source,
});
export const official = {
  medals: 'https://competition.igem.org/judging/medals',
  awards: 'https://competition.igem.org/judging/special-prizes',
  wiki: 'https://competition.igem.org/deliverables/team-wiki',
  attributions: 'https://competition.igem.org/deliverables/project-attribution',
  calendar: 'https://competition.igem.org/about/calendar',
  rules: 'https://competition.igem.org/about/rules-and-policies',
};
export const wikiPages: WikiPage[] = [
  page(
    'description',
    'Project description',
    'Project',
    'The problem, the inspiration, and the question our project will address.',
    'Core documentation',
    [
      [
        'The problem',
        'Describe the specific prion-related problem your team has chosen. Identify who is affected, the limits of existing approaches, and the sources supporting that need.',
      ],
      [
        'Our idea',
        'State your project hypothesis and explain the role of synthetic biology. Specify whether the work is computational, uses a non-infectious model, or involves another approved approach.',
      ],
      [
        'Goals & success criteria',
        'List the project objectives and measurable criteria you will use to assess them. Separate proposed work from work already completed.',
      ],
      [
        'Background & inspiration',
        'Cite the papers and previous iGEM projects that informed your idea. Explain what your team intends to add.',
      ],
    ],
  ),
  page(
    'design',
    'Project design',
    'Project',
    'How the proposed system connects a biological question to a testable design.',
    'Core documentation',
    [
      [
        'System overview',
        'Add your system diagram and explain the intended inputs, outputs, components, and boundaries. Distinguish conceptual designs from validated functions.',
      ],
      [
        'Design decisions',
        'Record alternative approaches, selection criteria, and the evidence behind each decision. Link the relevant model and human practices findings.',
      ],
      [
        'Assumptions & limitations',
        'State the assumptions, known constraints, and failure modes. Explain how the design will be evaluated without implying unverified performance.',
      ],
    ],
  ),
  page(
    'engineering',
    'Engineering success',
    'Project',
    'Document the iterations that turned observations into better design decisions.',
    'Medal documentation',
    [
      [
        'Design',
        'Define the technical problem, initial hypothesis, and criteria for this iteration.',
      ],
      [
        'Build',
        'Record what was implemented and link the relevant design files, approved methods, or code version.',
      ],
      [
        'Test',
        'Present the evaluation, appropriate controls, observations, and evidence. Include unsuccessful outcomes.',
      ],
      [
        'Learn & iterate',
        'Explain what the evidence changed, what you revised, and how the next iteration addresses the original problem.',
      ],
    ],
    official.medals,
  ),
  page(
    'results',
    'Results',
    'Project',
    'The evidence, its interpretation, and the limits of what can be concluded.',
    'Core documentation',
    [
      [
        'Key findings',
        'Add your verified findings with figure captions and links to supporting datasets. No experimental results have been supplied yet.',
      ],
      [
        'Analysis & uncertainty',
        'Describe analysis methods, sample sizes, controls, uncertainty, and how conclusions follow from the evidence.',
      ],
      [
        'What did not work',
        'Document negative or inconclusive outcomes and what you learned from them.',
      ],
      [
        'Conclusions & next steps',
        'Compare outcomes with the project goals. Separate demonstrated results from future plans.',
      ],
    ],
  ),
  page(
    'proof-of-concept',
    'Proof of concept',
    'Project',
    'A focused demonstration of the proposed system’s intended use.',
    'Core documentation',
    [
      [
        'Demonstration scope',
        'Define the function you aim to demonstrate and the acceptance criteria. This is supporting documentation, not a separate 2026 medal criterion.',
      ],
      [
        'Evidence & limitations',
        'Add the actual demonstration and its evidence. Explain which parts remain untested and what further validation is needed.',
      ],
    ],
  ),
  page(
    'implementation',
    'Proposed implementation',
    'Project',
    'Where the idea could be used, by whom, and under which constraints.',
    'Core documentation',
    [
      [
        'Intended users & setting',
        'Describe proposed users and the use setting, supported by evidence from your human practices work.',
      ],
      [
        'Path to use',
        'Outline the development, validation, oversight, and resources that would be needed. Do not present a research concept as a validated clinical product.',
      ],
      [
        'Risks & practical limits',
        'Discuss accessibility, cost, maintenance, misuse, and end-of-life considerations appropriate to the project.',
      ],
    ],
  ),
  page(
    'contribution',
    'Contribution',
    'Project',
    'Make the useful parts of this work accessible to the next team.',
    'Medal documentation',
    [
      [
        'What we are sharing',
        'Identify a concrete resource, dataset, analysis, or other useful contribution your team actually produced.',
      ],
      [
        'How to use it',
        'Provide the resource location, documentation, requirements, licensing information, and limitations.',
      ],
      [
        'Value for future teams',
        'Explain the need it addresses and include evidence of usefulness where available. Cite any prior work it builds upon.',
      ],
    ],
    official.medals,
  ),
  page(
    'experiments',
    'Experiments & protocols',
    'Research',
    'A traceable record of approved methods and how observations were collected.',
    'Core documentation',
    [
      [
        'Research approach',
        'Describe the study design, model system, approved scope, and how each activity connects to a project question.',
      ],
      [
        'Methods documentation',
        'Link supervisor-reviewed methods and their sources. Identify versions, dates, relevant approvals, and departures from the approved plan.',
      ],
      [
        'Controls & data management',
        'Describe the rationale for controls, records, data organization, quality checks, and access to supporting files.',
      ],
    ],
  ),
  page(
    'notebook',
    'Lab notebook',
    'Research',
    'A chronological record connecting the team’s decisions, activities, and evidence.',
    'Core documentation',
    [
      [
        'Project timeline',
        'Add dated milestones from project selection through documentation. Keep planned and completed activities distinct.',
      ],
      [
        'Research entries',
        'For each dated entry, record the objective, contributors, approved activity, observations, linked files, and next decision.',
      ],
      [
        'Team reflections',
        'Record unresolved questions and how collaboration across research, modeling, and human practices changed the work.',
      ],
    ],
  ),
  page(
    'parts',
    'Parts & Registry',
    'Research',
    'Connect the project’s biological components to their authoritative Registry records.',
    'Core documentation',
    [
      [
        'Parts overview',
        'List only actual parts used or developed, with their Registry identifiers, roles, and documentation links. No part identifiers have been provided.',
      ],
      [
        'New basic & composite parts',
        'If relevant, distinguish single-component parts from composite devices and link characterization evidence on the Registry.',
      ],
      [
        'Improved parts',
        'If relevant, link the original and modified entries and provide the comparative evidence supporting an improvement.',
      ],
      [
        'Part collection',
        'If relevant, link the Registry collection documentation and explain how its components work together. These four part-related awards are assessed on Registry records rather than dedicated standard wiki URLs.',
      ],
    ],
    official.awards,
  ),
  page(
    'model',
    'Model',
    'Research',
    'Connect assumptions and predictions to decisions in the project.',
    'Optional award',
    [
      [
        'Model question & assumptions',
        'Define the question, assumptions, model scope, variables, and units.',
      ],
      [
        'Approach & reproducibility',
        'Document equations or computational methods, data provenance, parameter choices, and the code or files needed to examine the work.',
      ],
      [
        'Validation & uncertainty',
        'Describe evaluation against relevant evidence, uncertainty, and the limits of extrapolation.',
      ],
      [
        'Impact on the project',
        'Show specific decisions that were informed or changed by the model.',
      ],
    ],
    official.awards,
  ),
  page(
    'measurement',
    'Measurement',
    'Research',
    'Explain what was measured and why the numbers can be trusted.',
    'Optional award',
    [
      [
        'Measurement goals',
        'State the quantities or metrics, their units, and their relevance to the project.',
      ],
      [
        'Methods & quality',
        'Describe the measurement approach, calibration or validation, controls, and data quality checks.',
      ],
      [
        'Results & reproducibility',
        'Present actual evidence with uncertainty and sufficient documentation for others to understand the measurements.',
      ],
    ],
    official.awards,
  ),
  page(
    'safety',
    'Project safety',
    'Research',
    'Document the project’s risk assessment, oversight, and approved boundaries.',
    'Core documentation',
    [
      [
        'Scope & risk assessment',
        'Identify the actual materials, model systems, activities, and potential hazards. Explain the scope of the prion-related work and what is excluded.',
      ],
      [
        'Oversight & approvals',
        'Record institutional oversight, training, applicable approvals, and the status of required iGEM safety submissions. No approval has been asserted by this wiki.',
      ],
      [
        'Risk management',
        'Summarize the supervisor-approved measures used to manage risks, including disposal and incident reporting, without substituting wiki text for institutional procedures.',
      ],
      [
        'Responsible development',
        'Consider unintended use, environmental effects, and how project design choices reduce risk.',
      ],
    ],
    official.rules,
  ),
  page(
    'human-practices',
    'Human practices',
    'Impact',
    'How people, values, and feedback shape the direction of the project.',
    'Medal documentation',
    [
      [
        'Context & values',
        'Describe the social context, intended beneficiaries, and values guiding your project.',
      ],
      [
        'Listening to stakeholders',
        'Document actual engagements, who participated with permission, their perspectives, and the limitations of your sample.',
      ],
      [
        'Feedback into design',
        'Connect each important insight to a specific decision or change. Explain where perspectives conflicted and how you responded.',
      ],
      [
        'Reflection & impact',
        'Assess whether the work is responsible and useful, drawing on evidence rather than only intentions. This page also supports Integrated Human Practices if selected.',
      ],
    ],
    official.medals,
  ),
  page(
    'education',
    'Education & outreach',
    'Impact',
    'Create opportunities for mutual learning about science.',
    'Optional award',
    [
      [
        'Audience & learning goals',
        'Identify your intended learners, their context, and how you established their needs.',
      ],
      [
        'Activities & materials',
        'Document activities that actually took place, reusable materials, permissions, and accessibility choices.',
      ],
      [
        'Feedback & learning',
        'Provide evidence of what participants and the team learned, then explain what you changed.',
      ],
    ],
    official.awards,
  ),
  page(
    'inclusivity',
    'Inclusivity',
    'Impact',
    'Understand barriers to participation and document efforts to reduce them.',
    'Optional award',
    [
      [
        'Barriers & dialogue',
        'Describe the barriers you investigated and whose perspectives informed that understanding.',
      ],
      [
        'Actions taken',
        'Document the changes your team actually made and the reasoning behind them.',
      ],
      [
        'Outcomes & reflection',
        'Provide evidence of outcomes, remaining barriers, and lessons that others can reuse.',
      ],
    ],
    official.awards,
  ),
  page(
    'sustainability',
    'Sustainable development',
    'Impact',
    'Examine the project’s potential benefits, trade-offs, and wider effects.',
    'Optional award',
    [
      [
        'Relevant goals',
        'Identify specific Sustainable Development Goals and targets that genuinely relate to your project.',
      ],
      [
        'Stakeholder perspectives',
        'Document how relevant stakeholders helped assess priorities and potential impacts.',
      ],
      [
        'Evidence & trade-offs',
        'Assess positive and negative interactions, measurable outcomes where available, and remaining uncertainties.',
      ],
    ],
    official.awards,
  ),
  page(
    'entrepreneurship',
    'Entrepreneurship',
    'Impact',
    'Explore a credible path from a research idea to a useful application.',
    'Optional award',
    [
      [
        'User need & value',
        'Identify potential first users or customers and evidence of an unmet need.',
      ],
      [
        'Feasibility & development',
        'Document the proposed value, alternatives, development milestones, resources, and any actual prototype evidence.',
      ],
      [
        'Risks & responsible adoption',
        'Examine costs, implementation barriers, long-term impacts, and limits of your business assumptions.',
      ],
    ],
    official.awards,
  ),
  page(
    'hardware',
    'Hardware',
    'Research',
    'Document a physical tool, its purpose, and the evidence behind its performance.',
    'Optional award',
    [
      [
        'Purpose & design',
        'Describe the need and the device your team actually designed, with versioned design files and component credits.',
      ],
      [
        'Evaluation',
        'Document functional evidence and user feedback. Distinguish simulations from physical tests.',
      ],
      [
        'Reuse & limitations',
        'Provide assembly documentation, licensing, operating boundaries, and the lessons needed for responsible reuse.',
      ],
    ],
    official.awards,
  ),
  page(
    'software',
    'Software',
    'Research',
    'Explain the computational work, its validation, and how others can use it.',
    'Optional award',
    [
      [
        'Purpose & functionality',
        'Identify the research software your team produced and its connection to synthetic biology. Do not count this wiki itself as evidence of research software.',
      ],
      [
        'Validation & usability',
        'Document benchmarks, test data, limitations, user feedback, and reproducible examples.',
      ],
      [
        'Source & licensing',
        'Provide the actual dedicated iGEM GitLab repository, release version, documentation, and OSI-approved license. Software & AI Village teams are not eligible for Best Software.',
      ],
    ],
    official.awards,
  ),
  page(
    'alternative-platform',
    'Alternative platform',
    'Research',
    'Explain why an alternative biological platform suits the project.',
    'Optional award',
    [
      [
        'Platform rationale',
        'Identify the actual platform, compare it with relevant alternatives, and explain the connection to your project goals.',
      ],
      [
        'Engineering evidence',
        'Document the engineering work and its outcomes within the approved scope.',
      ],
      [
        'Lessons for reuse',
        'Record limitations, unsuccessful approaches, and documentation that may help future teams.',
      ],
    ],
    official.awards,
  ),
  page(
    'safety-and-security',
    'Safety & security innovation',
    'Impact',
    'Document an original contribution to making biological engineering safer.',
    'Optional award',
    [
      [
        'Safety challenge',
        'Describe the biosafety or biosecurity problem your contribution addresses and the existing work it builds on.',
      ],
      [
        'Contribution & evidence',
        'Present the actual safety-related tool, approach, or insight and the evidence supporting its usefulness.',
      ],
      [
        'Project & real-world risks',
        'Connect the contribution to responsible use and link the project’s own safety documentation. Routine safety compliance alone should not be presented as an innovation.',
      ],
    ],
    official.awards,
  ),
  page(
    'team',
    'Our team',
    'Team',
    'The people and roles behind the project.',
    'Core documentation',
    [
      [
        'Team identity',
        'Add the registered team name, institution, competition year, village, and team number. Prion Collective is a working project title.',
      ],
      [
        'Student members',
        'Add the real team roster and roles with permission to publish names and photographs. No team members have been invented.',
      ],
      [
        'PIs, instructors & advisors',
        'Record the actual supporting people and their roles. Link the official Attributions Form for the detailed contribution record.',
      ],
      ['Contact', 'Add a team-approved public contact channel.'],
    ],
  ),
  page(
    'attributions',
    'Attributions',
    'Team',
    'Recognize the work of students and the people who supported them.',
    'Medal documentation',
    [
      [
        'Official form',
        'Complete the standardized Project Attributions Form through iGEM and embed the team-specific form here. The registered team ID is needed before the embed can be connected. Narrative text on this page does not replace the official form.',
      ],
    ],
    official.attributions,
  ),
  page(
    'collaborations',
    'Collaborations',
    'Team',
    'Document shared work, reciprocal learning, and the contribution of each partner.',
    'Core documentation',
    [
      [
        'Partners & shared objectives',
        'List actual collaborators and explain why you worked together.',
      ],
      [
        'Work & outcomes',
        'Describe the contributions on each side, the evidence produced, and what changed through the collaboration.',
      ],
      [
        'Credits & permissions',
        'Obtain permission for names, quotations, and images; cross-link the partner’s work and the attributions record.',
      ],
    ],
  ),
  page(
    'acknowledgements',
    'Acknowledgements & support',
    'Team',
    'Recognize the organizations and resources that made the work possible.',
    'Core documentation',
    [
      [
        'Institutional & financial support',
        'List actual host institutions, funding, facilities, and in-kind support.',
      ],
      [
        'Sponsors & partners',
        'Add only confirmed sponsorships and logos that the team has permission to publish.',
      ],
      [
        'Acknowledgements',
        'Thank contributors accurately and link the official Attributions Form for their roles.',
      ],
    ],
  ),
  page(
    'references',
    'References & credits',
    'Team',
    'Keep scientific sources, reused materials, and creative contributions traceable.',
    'Core documentation',
    [
      [
        'Project bibliography',
        'Add complete citations for project-specific claims, figures, datasets, and prior iGEM work. Link citations close to the claims they support as well as here.',
      ],
      [
        'Asset & tool credits',
        'The molecular hero is an AI-generated conceptual illustration made with OpenAI image generation; it is not an experimentally determined prion structure. The site interface and starter copy were generated with Codex and require team review. Icons are from Lucide (ISC license). UI primitives use the installed shadcn and Base UI components.',
      ],
      [
        'Licensing review',
        'Record source and license information for each reused asset, dataset, and code component. The official iGEM publication needs its required licensing notice and a link to the actual team GitLab repository.',
      ],
    ],
  ),
  page(
    'presentation',
    'Presentation & videos',
    'Team',
    'Tell the project story with clear evidence and properly credited media.',
    'Core documentation',
    [
      [
        'Project summary',
        'Prepare a concise narrative covering the problem, approach, verified findings, limitations, and the team’s contribution.',
      ],
      [
        'Presentation video',
        'Add the team’s actual submitted presentation video from iGEM Video Universe, along with captions or a transcript and visual credits. No video has been provided yet.',
      ],
      [
        'Other media & judging session',
        'Link any required promotion video or other submitted media, and record judging-session preparation. Check the official deliverable instructions for the applicable year.',
      ],
    ],
    official.calendar,
  ),
  page(
    'judging',
    'Judging guide',
    'Judging',
    'A clear route from each requirement to the evidence that supports it.',
    'Submission guide',
    [
      [
        'Submission status',
        'Competition year is provisionally 2026. Confirm your registered team identity and chosen awards. These pages are writing scaffolds until the team adds and reviews its evidence; creating pages does not satisfy medal criteria.',
      ],
      [
        'Official publication',
        'This private site is the collaborative authoring workspace. Before wiki freeze, publish the final snapshot through the team’s official iGEM wiki workflow, with assets on approved iGEM hosting and the official attributions embed. The final judged wiki must not depend on this live editing service.',
      ],
      [
        'Final review',
        'Check the year-specific rules, preserved standard page paths, source citations, image permissions, accessibility, licensing notice, official source-repository link, and links to the submitted evidence.',
      ],
    ],
    official.medals,
  ),
];
export const wikiKey = (slug: string, sectionId: string) =>
  `wiki:${slug}:${sectionId}`;
export const wikiDefaults: Record<string, string> = Object.fromEntries(
  wikiPages.flatMap((p) =>
    p.sections.map((s) => [wikiKey(p.slug, s.id), s.prompt]),
  ),
);
export const wikiGroups = ['Project', 'Research', 'Impact', 'Team'];
