import assert from 'node:assert/strict';
import { currentSection } from '../app/section-position.js';
const positions = [
  { top: 100, index: 0 },
  { top: 500, index: 1 },
  { top: 500, index: 2 },
  { top: 950, index: 3 },
];
assert.equal(currentSection([], 100), -1);
assert.equal(currentSection(positions, 0), 0);
assert.equal(currentSection(positions, 499), 0);
assert.equal(currentSection(positions, 500), 1);
assert.equal(currentSection(positions, 600, 2), 2);
assert.equal(currentSection(positions, 950, 2), 3);
assert.equal(currentSection(positions, 600, 3), 1);
assert.equal(currentSection(positions, 2000), 3);
assert.equal(
  currentSection(
    [
      { top: 100, index: 2 },
      { top: 500, index: 0 },
    ],
    600,
  ),
  0,
);
console.log(
  'PASS: section boundaries, reverse scrolling, aligned headings, preserved clicked marker, and empty pages.',
);
