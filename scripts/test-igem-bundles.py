import base64
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

root = Path(__file__).resolve().parent.parent
work = Path(tempfile.mkdtemp(prefix='igem-bundle-test-', dir=root / 'work'))
snapshot = json.loads((root / 'work/notebook-purple-clean.json').read_text(encoding='utf-8'))
snapshot['values']['ai:brief'] = 'PRIVATE-BRIEF-TEST'
snapshot['values']['private:token'] = 'PRIVATE-TOKEN-TEST'
snapshot['users'] = [{'email': 'PRIVATE-IDENTITY-TEST'}]
layout = json.loads(snapshot['values']['layout:home'])
snapshot['media'] = {}
fixtures = {}
for kind, ext, data in [('video', 'mp4', b'\x00\x00\x00\x18ftypisomTEST'), ('audio', 'mp3', b'ID3TEST')]:
    url = '/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.' + ext
    fixtures[url] = data
    snapshot['media'][url] = base64.b64encode(data).decode()
    layout['nodes'].append(dict(id='test-'+kind, kind=kind, src=url, title='TEST', body='', caption='', alt='',
                                span=12, align='left', background='', padding=0, hidden=False))
    layout['order'].append('test-' + kind)
snapshot['values']['layout:home'] = json.dumps(layout)
source = work / 'private-test-snapshot.json'
source.write_text(json.dumps(snapshot), encoding='utf-8')
out = work / 'bundles'
command = [sys.executable, str(root / 'scripts/package-igem.py'), '--snapshot', str(source), '--out', str(out)]
run = subprocess.run(command, cwd=root, capture_output=True, text=True)
assert run.returncode == 0, run.stdout + run.stderr
assert sorted(p.name for p in out.iterdir()) == ['01-website-source.zip', '02-static-assets.zip']
checkout = work / 'checkout'
with zipfile.ZipFile(out / '01-website-source.zip') as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert b'SPDX-License-Identifier: CC-BY-4.0' in archive.read('LICENSE')
    assert '.gitlab-ci.yml' in names and 'package-lock.json' in names
    for name in ['.gitlab-ci.yml', 'ops/igem.gitlab-ci.yml']:
        assert archive.read(name) == (root / 'ops/igem.gitlab-ci.yml').read_bytes()
    assert not any(n.startswith(('public/', 'server/', 'node_modules/', 'work/', 'app/api/')) for n in names)
    content = archive.read('publication/content.json').decode()
    assert 'PRIVATE-' not in content
    assert 'media' not in json.loads(content)
    assert json.loads(archive.read('package.json'))['scripts']['build'] == 'node scripts/build-igem.mjs'
    archive.extractall(checkout)
with zipfile.ZipFile(out / '02-static-assets.zip') as archive:
    assert len([n for n in archive.namelist() if n.startswith('assets/')]) == 29
    assert all(n.startswith(('assets/logos/', 'assets/fonts/', 'assets/icons/')) for n in archive.namelist() if n.startswith('assets/'))
    assert not any(n.endswith(('.mp4', '.mp3')) for n in archive.namelist())
with zipfile.ZipFile(out / '01-website-source.zip') as archive:
    assert len(json.loads(archive.read('publication/recording-todos.json'))) == 2
second = subprocess.run(command, cwd=root, capture_output=True, text=True)
assert second.returncode != 0 and 'not overwritten' in second.stderr

# Test extracted source without any files outside the bundle other than installed dependencies.
subprocess.run(['node', '-e', "require('fs').symlinkSync(process.argv[1],process.argv[2],'junction')", str(root/'node_modules'), str(checkout/'node_modules')], check=True)
assert 'SPDX-License-Identifier: CC-BY-4.0' in (checkout/'LICENSE').read_text(encoding='utf-8')
publication = checkout/'publication'
mapping = json.loads((publication/'media-map.json').read_text(encoding='utf-8'))
for i, url in enumerate(mapping):
    mapping[url] = ('https://video.igem.org/videos/embed/test-' + str(i) if url in fixtures
                    else 'https://static.igem.wiki/teams/6377/test/' + str(i) + '.png')
(publication/'media-map.json').write_text(json.dumps(mapping), encoding='utf-8')
config = json.loads((publication/'config.json').read_text(encoding='utf-8'))
config.update(fontCss='publication/fonts.css', attributionUrl='https://teams.igem.org/wiki/6377/attributions')
(publication/'config.json').write_text(json.dumps(config), encoding='utf-8')
(publication/'fonts.css').write_text('@font-face {font-family:"DM Sans";src:url("https://static.igem.wiki/teams/6377/test/font.woff2")}', encoding='utf-8')
review = json.loads((publication/'review.json').read_text(encoding='utf-8'))
review = {key: True if isinstance(value, bool) else value for key, value in review.items()}
review.update(reviewer='Synthetic test fixture', reviewedAt='2026-10-05')
(publication/'review.json').write_text(json.dumps(review), encoding='utf-8')
build = subprocess.run(['node', 'scripts/build-igem.mjs'], cwd=checkout, capture_output=True, text=True)
assert build.returncode == 0, build.stdout + build.stderr
report = json.loads((checkout/'igem-build/publication-report.json').read_text(encoding='utf-8'))
assert report['pageCount'] == 20 and report['issues'] == []
print('PASS: exactly two valid ZIPs; recordings excluded with TODOs; private metadata, AI brief and unknown values omitted; overwrite refused; extracted source builds all 20 pages with test mappings. No real uploads or publication performed.')
