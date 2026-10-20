import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { downloadExternalAsset, publicAssetAddress } from '../server/export-remote-assets.mjs';
import { exportMedia } from './export-media.mjs';
import { createBundleExports } from '../selfhost-dist/server/export-bundles.mjs';

const directory = await mkdtemp(path.resolve('work/export-remote-assets-'));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18"/></svg>';
let requests = 0;
const server = createServer((req, res) => {
  requests++;
  if (req.url === '/redirect') return res.writeHead(302, { location: '/image.svg' }).end();
  if (req.url === '/private') return res.writeHead(302, { location: 'http://127.0.0.1/secret.svg' }).end();
  if (req.url === '/loop') return res.writeHead(302, { location: '/loop' }).end();
  if (req.url === '/missing.svg') return res.writeHead(404).end();
  if (req.url === '/fake.jpg') return res.writeHead(200, { 'content-type': 'text/html' }).end('<html>Login</html>');
  if (req.url === '/slow.svg') return; // client timeout closes the socket
  if (req.url === '/large.svg') {
    res.writeHead(200, { 'content-type': 'image/svg+xml' });
    res.write('x'.repeat(64)); return res.end('x'.repeat(64));
  }
  if (req.url === '/empty.svg') return res.writeHead(200, { 'content-type': 'image/svg+xml' }).end();
  res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(svg);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const options = {
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
  request(url, opts, callback) {
    opts.lookup(url.hostname, { all: true }, (err, records) => {
      assert.equal(err, null);
      assert.equal(records[0].address, '93.184.216.34', 'connect uses the validated address');
    });
    assert.equal(opts.headers.authorization, undefined);
    assert.equal(opts.headers.cookie, undefined);
    // Test transport only: production uses the validated public socket lookup.
    return httpRequest(new URL(url.pathname + url.search, `http://127.0.0.1:${server.address().port}`), opts, callback);
  },
};
const download = (source, dir = directory, extra = {}) =>
  downloadExternalAsset(source, dir, { ...options, ...extra });
try {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '100.64.0.1', '192.168.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1', '2002:7f00:1::'])
    assert.equal(publicAssetAddress(address), false, address);
  for (const address of ['93.184.216.34', '2606:4700:4700::1111'])
    assert.equal(publicAssetAddress(address), true, address);
  const local = await download('https://photos.example/redirect');
  assert.equal(await readFile(local.file, 'utf8'), svg);
  assert.ok(local.file.endsWith('.svg'), 'MIME identifies extensionless CDN responses');
  const before = requests;
  for (const source of ['http://127.1/image.svg', 'http://[::1]/x.svg', 'http://user:password@photos.example/image.svg', 'http://photos.example:8080/x.svg', 'file:///etc/passwd'])
    await assert.rejects(download(source), { status: 422 });
  assert.equal(requests, before, 'private and credential-bearing URLs rejected before requests');
  await assert.rejects(download('https://photos.example/private'), /not a public internet address/);
  assert.equal(requests, before + 1, 'private redirect is not followed');
  await assert.rejects(download('https://photos.example/dns.svg', directory, {
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
  }), /not a public internet address/);
  for (const [route, message] of [
    ['missing.svg', /HTTP 404/], ['fake.jpg', /sign-in or error page/],
    ['loop', /Too many redirects/], ['empty.svg', /empty file/],
  ]) await assert.rejects(download('https://photos.example/' + route), message);
  await assert.rejects(download('https://photos.example/large.svg', directory, { maxBytes: 100 }), /size limit/);
  await assert.rejects(download('https://photos.example/slow.svg', directory, { timeoutMs: 50 }), /timed out/);
  assert.equal((await readdir(directory)).length, 1, 'failed partial downloads are removed');

  const image = 'https://photos.example/image.svg';
  const widget = 'https://photos.example/photo-without-extension?size=large&amp;v=1';
  const values = {
    'layout:home': JSON.stringify({ nodes: [
      { id: 'photo', name: 'Festival photo', kind: 'image', src: image },
      { id: 'widget', name: 'Photo cards', kind: 'html', html: `<img src="${widget}"><iframe src="https://video.igem.org/videos/embed/example"></iframe><a href="https://example.com/about">About</a>` },
      { id: 'hidden', hidden: true, kind: 'image', src: 'https://photos.example/missing.svg' },
    ], order: ['photo', 'widget', 'hidden'], customCss: `.photo { background:url("${image}") }` }),
  };
  const refs = exportMedia(values, { pages: [] });
  assert.ok(refs.has(image) && refs.has(widget));
  assert.ok(!refs.has('https://photos.example/missing.svg'));
  assert.ok(![...refs.keys()].some(x => x.includes('video.igem.org') || x.includes('/about')));
  const exporter = createBundleExports({
    dataDir: directory, clientDir: path.resolve('selfhost-dist/client'),
    remoteDownloader: (source, dir) => download(source, dir),
  });
  const input = {
    userId: 'tester', project: { id: 'test', name: 'Remote assets' }, team: 'imperial-college',
    template: { pages: ['home', 'attributions', 'contribution', 'engineering', 'human-practices'].map(slug => ({ slug, layers: [] })) },
    values,
  };
  try {
    const plan = await exporter.prepare(input);
    assert.equal(plan.externalFiles, 0);
    for (const key of ['assets', 'source']) {
      const res = createWriteStream(path.join(directory, key + '.zip'));
      res.writeHead = () => {};
      await exporter.download({ id: plan.id, key, userId: 'tester', projectId: 'test', res });
    }
    execFileSync('python', ['-c', `
import zipfile,csv,io,json,sys
from pathlib import Path
p=Path(sys.argv[1])
with zipfile.ZipFile(p/'assets.zip') as z:
 rows=list(csv.DictReader(io.StringIO(z.read('upload-manifest.csv').decode())))
 assert all(r['file'] and r['file'] in z.namelist() for r in rows),rows
 external=[r for r in rows if r['source'].startswith('https://photos.example/')]
 assert len(external)==2
 assert all(b'<svg' in z.read(r['file']) for r in external)
with zipfile.ZipFile(p/'source.zip') as z:
 content=json.loads(z.read('publication/content.json'))['values']
 assert 'https://photos.example/image.svg' in content['layout:home']
 mapping=json.loads(z.read('publication/media-map.json'))
 assert 'https://photos.example/image.svg' in mapping
`, directory], { stdio: 'pipe' });
    const bad = structuredClone(input);
    bad.values['layout:home'] = JSON.stringify({ nodes: [
      { id: 'broken', name: 'Missing festival photo', kind: 'image', src: 'https://photos.example/missing.svg' },
    ] });
    await assert.rejects(exporter.prepare(bad), error => {
      assert.equal(error.status, 422);
      assert.equal(error.mediaIssues[0].locations[0].layerId, 'broken');
      assert.match(error.mediaIssues[0].reason, /HTTP 404/);
      return true;
    });
  } finally { exporter.close(); }
  console.log('PASS: streamed remote assets, redirects, public-address pinning, size/timeout/error cleanup, widget collection, complete local ZIP and actionable failures.');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
