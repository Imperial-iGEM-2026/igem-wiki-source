import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createDeflateRaw } from 'node:zlib';
import path from 'node:path';

// Estimate the runner's ZIP without allocating an archive or loading files into
// memory. Runner compression/ZIP metadata can differ; this is not its exact size.
export async function artifactSize(out) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  await walk(path.join(out, 'public'));
  files.push(path.join(out, 'publication-report.json'));
  const entries = [];
  let compressedEstimate = 22;
  for (const file of files) {
    const bytes = (await stat(file)).size;
    let compressed = 0;
    await pipeline(createReadStream(file), createDeflateRaw({ level: 9 }), new Writable({
      write(chunk, encoding, done) { compressed += chunk.length; done(); },
    }));
    const name = 'igem-build/' + path.relative(out, file).split(path.sep).join('/');
    compressedEstimate += compressed + 76 + 2 * Buffer.byteLength(name);
    entries.push({ name, bytes });
  }
  return {
    files: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    compressedEstimate,
    largest: entries.sort((a, b) => b.bytes - a.bytes).slice(0, 5),
  };
}

export async function logArtifactSize(out) {
  const result = await artifactSize(out);
  const mib = (bytes) => (bytes / 1048576).toFixed(2) + ' MiB';
  console.log(`Pages artifact: ${result.files} files, ${mib(result.bytes)} uncompressed; estimated compressed ZIP ${mib(result.compressedEstimate)} (runner size may differ).`);
  for (const entry of result.largest) console.log(`  ${mib(entry.bytes)}  ${entry.name}`);
  console.log('A later HTTP 413 means the GitLab coordinator/proxy rejected the artifact upload. Its limit is separate from the static uploader per-file limit and your Studio VPS memory.');
  return result;
}
