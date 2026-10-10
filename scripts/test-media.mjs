import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin = 'http://localhost:3000';
const cookie = '__sites_local_auth=1';
async function upload(name, body, auth = true) {
  return fetch(origin + '/api/media?name=' + name, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/octet-stream',
      ...(auth ? { Cookie: cookie } : {}),
    },
    body,
  });
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh4kAAAAASUVORK5CYII=',
  'base64',
);
const result = await upload('fixture.png', png);
const saved = await result.json();
console.log('upload', result.status, saved);
assert.equal(result.status, 200);
const get = await fetch(origin + saved.url, { headers: { Cookie: cookie } });
assert.equal(get.status, 200);
assert.deepEqual(Buffer.from(await get.arrayBuffer()), png);
const range = await fetch(origin + saved.url, {
  headers: { Cookie: cookie, Range: 'bytes=0-15' },
});
assert.equal(range.status, 206);
assert.equal((await range.arrayBuffer()).byteLength, 16);
assert.equal((await fetch(origin + saved.url)).status, 401);
assert.equal((await upload('fixture.png', png, false)).status, 401);
assert.equal((await upload('fake.pdf', png)).status, 400);
assert.equal((await upload('unsafe.html', png)).status, 400);
const content = await (await fetch(origin + '/api/content')).json();
const row = content.rows.find((x) => x.id === 'layout:home');
const version = row?.version || 0;
const layout = {
  order: ['block-test'],
  nodes: [
    {
      id: 'block-test',
      kind: 'image',
      title: 'Test media',
      body: '',
      src: saved.url,
      caption: 'Verification fixture',
      alt: 'Test',
      span: 6,
      align: 'center',
      background: '#eeeeee',
      padding: 20,
      hidden: false,
    },
  ],
  gap: 24,
  width: 'full',
  sidebar: true,
};
async function save(value, v = version) {
  return fetch(origin + '/api/content', {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'layout:home',
      value: JSON.stringify(value),
      version: v,
    }),
  });
}
assert.equal((await save(layout)).status, 200);
assert.equal((await save(layout)).status, 409);
assert.equal(
  (
    await save(
      {
        ...layout,
        nodes: [{ ...layout.nodes[0], src: 'javascript:alert(1)' }],
      },
      version + 1,
    )
  ).status,
  400,
);
assert.equal(
  (await save({ ...layout, order: ['block-test', 'block-test'] }, version + 1))
    .status,
  400,
);
assert.equal(
  (
    await save(
      row
        ? JSON.parse(row.value)
        : { order: [], nodes: [], gap: 0, width: 'full', sidebar: true },
      version + 1,
    )
  ).status,
  200,
);
console.log(
  'Media and layout tests passed: upload/download, byte range, auth, type rejection, persistence, conflict rejection, URL validation, duplicate rejection, restore.',
);
