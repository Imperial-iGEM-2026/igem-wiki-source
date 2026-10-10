import assert from 'node:assert/strict';
import { createMotionLoop } from '../app/motion-loop.js';
const frames = new Map(),
  timers = new Map(),
  document = new EventTarget();
document.hidden = false;
let sequence = 0,
  onIntersection,
  disconnected = false;
const env = {
  document,
  requestAnimationFrame(fn) {
    frames.set(++sequence, fn);
    return sequence;
  },
  cancelAnimationFrame(id) {
    frames.delete(id);
  },
  setTimeout(fn) {
    timers.set(++sequence, fn);
    return sequence;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
  IntersectionObserver: class {
    constructor(fn) {
      onIntersection = fn;
    }
    observe() {}
    disconnect() {
      disconnected = true;
    }
  },
};
const loop = createMotionLoop({ isConnected: true }, env);
let drawings = 0;
function paint() {
  drawings++;
  loop.request(paint);
}
function tick(t) {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((fn) => fn(t));
}
loop.request(paint);
loop.request(paint);
assert.equal(frames.size, 1);
tick(0);
tick(16);
assert.equal(drawings, 1);
tick(34);
assert.equal(drawings, 2);
document.dispatchEvent(new Event('scroll'));
assert.equal(frames.size, 0);
tick(70);
assert.equal(drawings, 2);
document.dispatchEvent(new Event('scroll'));
assert.equal(timers.size, 1);
const resume = [...timers.values()][0];
timers.clear();
resume();
tick(180);
assert.equal(drawings, 3);
onIntersection([{ isIntersecting: false }]);
assert.equal(frames.size, 0);
onIntersection([{ isIntersecting: true }]);
tick(220);
assert.equal(drawings, 4);
document.hidden = true;
document.dispatchEvent(new Event('visibilitychange'));
assert.equal(frames.size, 0);
document.hidden = false;
document.dispatchEvent(new Event('visibilitychange'));
tick(240);
assert.equal(drawings, 5);
loop.setInteracting(true);
assert.equal(
  frames.size,
  0,
  'Hover/focus cancels pending SVG work immediately',
);
tick(280);
assert.equal(drawings, 5);
loop.setInteracting(false);
assert.equal(timers.size, 1, 'Wait for the rail exit transition');
loop.setInteracting(true);
assert.equal(
  timers.size,
  0,
  'Returning to the rail cancels the pending resume',
);
loop.setInteracting(false);
const release = [...timers.values()][0];
timers.clear();
document.dispatchEvent(new Event('scroll'));
release();
assert.equal(
  frames.size,
  0,
  'Releasing hover must not bypass the scroll pause',
);
const scrollEnd = [...timers.values()][0];
timers.clear();
scrollEnd();
tick(500);
assert.equal(drawings, 6, 'Drawing resumes after navigation settles');
loop.setInteracting(true);
loop.setInteracting(false);
loop.stop();
assert.equal(frames.size, 0);
assert.equal(timers.size, 0);
assert.ok(disconnected);
loop.request(paint);
assert.equal(frames.size, 0);
console.log(
  'PASS: 30 fps limit, scroll and rail interaction priority, delayed/cancelled resume, hidden/offscreen suspension and full cleanup.',
);
