import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runNativeImage } from '../selfhost-dist/server/image-native-process.mjs';

const sharp = createRequire(
  new URL(
    `../selfhost-dist/server/image-runtime/${process.platform}-${process.arch}/package.json`,
    import.meta.url,
  ),
)('sharp');
const dir = await mkdtemp(path.resolve('work/image-quality-'));
// Dense coloured lines, gradients and small lettering expose the chroma damage
// which flat-colour image fixtures miss. This represents diagrams and posters.
const svg =
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="3200" height="2000">
<defs><linearGradient id="g"><stop stop-color="#e69d73"/><stop offset="1" stop-color="#4f9dc3"/></linearGradient>
<pattern id="p" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 0H9M0 0V9" stroke="#b31457" stroke-width="2"/></pattern></defs>
<path fill="url(#g)" d="M0 0H3200V2000H0Z"/><path fill="url(#p)" d="M0 0H1600V2000H0Z"/>
<text x="1650" y="500" font-size="80" fill="#1d287c">Small text: ABC 123</text>
<circle cx="2400" cy="1300" r="450" fill="none" stroke="#dc163d" stroke-width="5"/></svg>`);
const decoded = await sharp(svg).png().toBuffer();
let legacyError = 0;
for (const format of ['png', 'jpeg', 'webp']) {
  const input = await sharp(decoded)[format]({ quality: 98 }).toBuffer();
  const file = path.join(dir, `detail.${format}`);
  await writeFile(file, input);
  for (const size of [160, 640, 1600]) {
    const start = performance.now();
    const result = await runNativeImage(file, {
      previewSize: size,
      timeoutMs: 30000,
    });
    const reference = await sharp(input)
      .rotate()
      .resize({
        width: size,
        height: size,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
        fastShrinkOnLoad: false,
      })
      .raw()
      .toBuffer();
    const actual = await sharp(result.data).raw().toBuffer();
    assert.deepEqual(
      actual,
      reference,
      `${format} ${size}: encoding must not damage resized pixels`,
    );
    const legacy = await sharp(
      await sharp(input)
        .rotate()
        .resize({
          width: size,
          height: size,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 1 })
        .toBuffer(),
    )
      .raw()
      .toBuffer();
    let error = 0;
    for (let i = 0; i < actual.length; i++)
      error += Math.abs(legacy[i] - reference[i]);
    legacyError += error;
    console.log(
      `${format} ${size}px: new pixel error 0; old mean error ${(error / actual.length).toFixed(2)}; ${Math.round(result.data.length / 1024)} KiB; ${Math.round(performance.now() - start)} ms; worker ${Math.round(result.peakRssKiB / 1024)} MiB`,
    );
  }
}
assert.ok(legacyError > 0, 'fixture must expose previous compression damage');
// High-resolution input stays in a short-lived, bounded native process.
for (const progressive of [false, true]) {
  const file = path.join(dir, `large-${progressive}.jpg`);
  await sharp(decoded)
    .resize(6000, 4000, { fit: 'fill' })
    .jpeg({ progressive, chromaSubsampling: '4:4:4' })
    .toFile(file);
  const result = await runNativeImage(file, {
    previewSize: 1600,
    timeoutMs: 30000,
  });
  assert.ok(
    result.peakRssKiB < 300 * 1024,
    'preview worker exceeded 300 MiB budget',
  );
  console.log(
    `24 MP ${progressive ? 'progressive' : 'baseline'}: worker ${Math.round(result.peakRssKiB / 1024)} MiB`,
  );
}
console.log(
  'PASS: lossless resized pixels across JPEG/PNG/WebP, small and canvas previews, bounded high-resolution workers.',
);
