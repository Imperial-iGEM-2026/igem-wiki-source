import '../app/globals.css';
if (document.querySelector('model-viewer')) import('@google/model-viewer');

import { startTemplateMotion } from '../app/template-motion';
for (const root of document.querySelectorAll<HTMLElement>(
  '[data-template-theme]',
))
  startTemplateMotion(root);

import { startReferenceNavigation } from '../app/reference-navigation';
startReferenceNavigation();
