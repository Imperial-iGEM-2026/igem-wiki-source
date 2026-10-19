import assert from 'node:assert/strict';
import {
  replaceRecordingFrames,
  recordingTasks,
  isVideoUniverseEmbed,
} from './export-recordings.mjs';
const url =
  'https://video.igem.org/videos/embed/abc-123?title=0&warningTitle=0#start';
assert.ok(isVideoUniverseEmbed(url));
for (const bad of [
  'https://video.igem.org.evil/videos/embed/abc',
  'https://user@video.igem.org/videos/embed/abc',
  'http://video.igem.org/videos/embed/abc',
  'https://video.igem.org/w/abc',
])
  assert.ok(!isVideoUniverseEmbed(bad));
const embed = `<iframe title="Player" src="${url.replaceAll('&', '&amp;')}" allow="autoplay; fullscreen" style="height:320px"></iframe>`;
assert.equal(replaceRecordingFrames(embed), embed);
const html = `<section style="grid-column:span 6"><video title="A > B" src="/api/media/missing.mp4"><source src="alternative.webm"></video><a href="/api/media/missing.mp4">Original</a></section><p>Following content</p><audio controls><source src="https://example.com/sound.mp3"></audio>`;
const todos = [];
const transformed = replaceRecordingFrames(html, todos, { page: 'home' });
assert.equal(todos.length, 2);
assert.equal(todos[1].source, 'https://example.com/sound.mp3');
assert.ok(transformed.includes('<section style="grid-column:span 6">'));
assert.ok(transformed.includes('<p>Following content</p>'));
assert.ok(!transformed.includes('<video'));
assert.ok(!transformed.includes('<audio'));
assert.ok(!transformed.includes('<a href='));
assert.match(transformed, /TODO: add a Video Universe/);
assert.match(transformed, /A &gt; B/);
const inert = `<script>const markup = '<video src="demo.mp4"></video>';</script><!-- <audio src="test.mp3"></audio> --><style>p:before{content:'<video>'}</style>`;
assert.equal(replaceRecordingFrames(inert), inert);
const escape = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
const document = `<html><body>${embed}<video src="raw.webm"></video><p>Kept</p></body></html>`;
const nested = [];
const frame = replaceRecordingFrames(
  `<iframe class="custom-html-frame" data-html-document="${escape(document)}"></iframe><p>After</p>`,
  nested,
);
assert.equal(nested.length, 1);
assert.ok(frame.includes('title=0&amp;amp;warningTitle=0'));
assert.ok(frame.includes('data-recording-todo'));
assert.ok(frame.endsWith('<p>After</p>'));
const pdf = '<iframe src="https://static.igem.wiki/report.pdf"></iframe>';
assert.equal(replaceRecordingFrames(pdf), pdf);
assert.match(
  replaceRecordingFrames(
    '<iframe src="https://www.youtube.com/embed/abc"></iframe>',
  ),
  /TODO/,
);
const values = {
  'layout:home': JSON.stringify({
    nodes: [
      { id: 'html', kind: 'html', html: '<audio src="raw.mp3"></audio>' },
      {
        id: 'hidden',
        hidden: true,
        kind: 'html',
        html: '<video src="hidden.mp4"></video>',
      },
    ],
  }),
};
assert.equal(recordingTasks(new Map(), new Map(), values).length, 1);
console.log(
  'PASS: native media TODOs, exact embed settings, nested HTML, following content, inert scripts, PDF frames and hidden sections.',
);
