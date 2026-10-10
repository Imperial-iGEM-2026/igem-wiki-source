"""Create three local handoff ZIPs. No upload, login or publication is performed."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def as_json(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def manifest(rows):
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=['source', 'kind', 'bundle', 'file', 'igem_url'])
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--out', required=True, help='New or empty destination directory')
    parser.add_argument('--media-dir')
    parser.add_argument('--team', default='imperial-college')
    parser.add_argument('--required-pages', default='', help='Comma-separated standard award page slugs')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.team):
        parser.error('--team must be a registered lowercase team slug')
    required = list(dict.fromkeys(filter(None, args.required_pages.split(','))))
    if any(not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) for slug in required):
        parser.error('--required-pages must contain standard page slugs')
    destination = Path(args.out).resolve()
    if destination.exists() and any(destination.iterdir()):
        parser.error('--out must be new or empty; existing bundles are not overwritten')
    snapshot_path = Path(args.snapshot).resolve()
    snapshot = json.loads(snapshot_path.read_text(encoding='utf-8-sig'))
    if snapshot.get('format') not in ['prion-wiki-snapshot', 'prion-wiki-source'] or snapshot.get('version') != 1:
        parser.error('Expected an editor snapshot or reviewed publication source')
    work = ROOT / 'work'
    work.mkdir(exist_ok=True)
    scratch = Path(tempfile.mkdtemp(prefix='igem-bundle-', dir=work))
    export = scratch / 'review'
    command = ['node', str(ROOT / 'scripts/export-static.mjs'), '--snapshot', str(snapshot_path),
               '--base', f'/{args.team}/', '--out', str(export), '--required-pages', ','.join(required)]
    if args.media_dir:
        command += ['--media-dir', str(Path(args.media_dir).resolve())]
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode:
        raise RuntimeError('Could not build the source snapshot. No upload ZIPs were created.\n' + result.stdout + result.stderr)
    report = json.loads((export / 'publication-report.json').read_text(encoding='utf-8'))
    missing = [page['path'] for page in report['standardPages'] if not page['present']]
    if missing:
        raise RuntimeError('Missing required iGEM pages: ' + ', '.join(missing))
    values = {key: value for key, value in snapshot['values'].items() if key in report['sourceFields']}
    content = {'format': 'prion-wiki-source', 'version': 1, 'values': values}
    rows, files = [], {'02-static-assets.zip': [], '03-video-audio.zip': []}
    for asset in report['assets']:
        bundle = '03-video-audio.zip' if asset['kind'] in ['audio', 'video', 'embed'] else '02-static-assets.zip'
        file_path, archive_path = None, ''
        if asset.get('file'):
            file_path = (export / asset['file']).resolve()
            if not file_path.is_relative_to(export.resolve()) or not file_path.is_file():
                raise RuntimeError('Export report contains an invalid asset file')
            # Stable unique names avoid collisions between two uploads named logo.png.
            suffix = hashlib.sha256(asset['source'].encode()).hexdigest()[:12]
            name = re.sub(r'[^a-zA-Z0-9._-]', '-', file_path.name)
            folder = asset['folder']
            if folder not in ['banners', 'logos', 'icons', 'images', 'documents', 'models', 'fonts', 'videos', 'audio']:
                raise RuntimeError('Invalid media folder in export report')
            archive_path = ('media/' if bundle.startswith('03') else 'assets/') + folder + '/' + suffix + '-' + name
            files[bundle].append((file_path, archive_path))
        rows.append({'source': asset['source'], 'kind': asset['kind'], 'bundle': bundle,
                     'file': archive_path, 'igem_url': ''})
    media_map = json.loads((export / 'media-map.example.json').read_text(encoding='utf-8'))
    config = json.loads((ROOT / 'publication/config.example.json').read_text(encoding='utf-8'))
    config.update(teamSlug=args.team, repository=f'https://gitlab.igem.org/2026/{args.team}', requiredPages=required)
    notes = {
        'template': values.get('site:template', 'legacy'), 'pages': report['pageCount'],
        'snapshot': snapshot_path.name, 'snapshotExportedAt': snapshot.get('exportedAt'),
        'liveServerRead': False, 'submissionReady': False,
        'staticFiles': len(files['02-static-assets.zip']), 'videoAudioFiles': len(files['03-video-audio.zip']),
        'fontsIncluded': any(row['kind'] == 'font' for row in rows),
        'note': 'Built from the supplied local snapshot only. No live edits or remote media were downloaded. Source values still require privacy/content review; review declarations are unset.',
    }
    common = ('Keep the category subfolders inside assets/ and media/. The helper creates matching folders in iGEM Uploads. Video/audio folders organize the ZIP; recordings still go to Video Universe.\n'
              'These are handoff ZIPs, not automatic submissions. Extract before uploading; '
              'do not assume the destination imports ZIP files. Use upload-manifest.csv to match each file '
              'to its original source URL. Copy the returned public URLs into publication/media-map.json '
              'from ZIP 01. The compiler then connects the website to the uploaded files.\n\n'
              'Remote files without a local file entry were not downloaded. Fonts are not included '
              'unless already represented as ordinary referenced files; Google Fonts still need licensed '
              'files uploaded and publication/fonts.css configured. See the full guide in ZIP 01.\n')
    source_readme = f'''# 01 — Website source → iGEM GitLab

1. Extract this ZIP locally. It contains editable source and content, not compiled HTML/CSS/JS.
2. Review publication/content.json BEFORE committing: saved values can include hidden/unpublished text.
   Snapshot metadata, embedded binaries, unknown fields and AI briefs are omitted, but this is not a full privacy scrub.
3. Upload the files from ZIPs 02 and 03, then fill publication/media-map.json with the actual returned URLs.
4. Set the official attribution iframe, selected award slugs and hosted fonts in publication/config.json.
5. Complete the real team reviews in publication/review.json. They are deliberately unset.
6. Merge these files into https://gitlab.igem.org/2026/{args.team}.
   Include the root LICENSE supplied in this ZIP: original team wiki work uses CC BY 4.0.
   Third-party assets and fonts retain their own licences and attribution notices.
   Inspect the staged diff: no private snapshot, database, environment file or compiled output belongs there.
7. Commit source to main through the team's review workflow. .gitlab-ci.yml runs npm ci and builds the Pages artifact.

Local build after configuration: npm ci, then node scripts/build-igem.mjs.
Use the local upload helper for the guided workflow. A ZIP upload alone does not deploy an iGEM wiki.

{common}'''
    readmes = {
        '02-static-assets.zip': '# 02 — Static files → iGEM Uploads\n\nExtract assets/ and upload its files through '
            f'https://teams.igem.org/go/deliverables/wiki/uploads for team {args.team}. '
            'Do not upload this README or manifest as website assets. Keep source/licence credits next to each '
            'asset in the wiki. Company logos still require the applicable permission.\n\n' + common,
        '03-video-audio.zip': '# 03 — Video and audio → iGEM Video Universe\n\nExtract media/ and upload recordings '
            'through https://video.igem.org/. Wait for processing and copy each iframe embed URL, '
            'not its watch-page URL, into the mapping in ZIP 01.\n\n' +
            ('No local video/audio files exist in this snapshot. This ZIP contains instructions and a manifest only.\n\n'
             if not files['03-video-audio.zip'] else '') + common,
    }
    source_zip = scratch / '01-website-source.zip'
    with zipfile.ZipFile(source_zip, 'w', zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        archive.write(ROOT / 'publication/wiki-LICENSE.txt', 'LICENSE')
        for directory in ['app', 'components', 'hooks', 'lib']:
            for file in sorted((ROOT / directory).rglob('*')):
                if file.is_file() and not file.is_symlink() and file.suffix in ['.ts', '.tsx', '.js', '.css', '.json']:
                    relative = file.relative_to(ROOT).as_posix()
                    if not relative.startswith('app/api/'):
                        archive.write(file, relative)
        for relative in ['package-lock.json', 'tsconfig.json',
                         'ops/igem.gitlab-ci.yml', 'scripts/build-igem.mjs', 'scripts/export-static.mjs',
                         'scripts/export-media.mjs', 'scripts/igem-resources.mjs', 'scripts/build-options.mjs', 'scripts/static-renderer.tsx',
                         'scripts/static-runtime.ts', 'scripts/preview-static.mjs']:
            archive.write(ROOT / relative, relative)
        package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
        package['scripts'] = {'build': 'node scripts/build-igem.mjs', 'export:static': 'node scripts/export-static.mjs',
                              'preview:static': 'node scripts/preview-static.mjs'}
        archive.writestr('package.json', as_json(package))
        archive.write(ROOT / 'ops/igem.gitlab-ci.yml', '.gitlab-ci.yml')
        archive.writestr('.gitignore', '/node_modules/\n/.static-build/\n/igem-build/\n/work/\n/.env*\n/prion-snapshot*.json\n')
        archive.writestr('publication/content.json', as_json(content))
        archive.writestr('publication/media-map.json', as_json(media_map))
        archive.writestr('publication/config.json', as_json(config))
        archive.writestr('publication/url-check.json', as_json({'base': report['base'], 'standardPages': report['standardPages']}))
        archive.write(ROOT / 'publication/review.example.json', 'publication/review.json')
        archive.writestr('UPLOAD-FIRST.txt', source_readme)
        archive.writestr('upload-manifest.csv', manifest(rows))
        archive.writestr('bundle-info.json', as_json(notes))
    font_notices = [p for p in (ROOT / 'public/templates/fonts').glob('*-OFL.txt') if any(p.name.split('-OFL')[0] in row['source'] for row in rows if row['kind'] == 'font')]
    for name, entries in files.items():
        with zipfile.ZipFile(scratch / name, 'w', zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
            if name == '02-static-assets.zip':
                for notice in font_notices: archive.write(notice, 'assets/fonts/' + notice.name)
            for file, relative in entries:
                # zipfile streams files from disk and supports ZIP64 for large recordings.
                archive.write(file, relative)
            archive.writestr('UPLOAD-FIRST.txt', readmes[name])
            archive.writestr('upload-manifest.csv', manifest([r for r in rows if r['bundle'] == name]))
            archive.writestr('bundle-info.json', as_json(notes))
    names = ['01-website-source.zip', '02-static-assets.zip', '03-video-audio.zip']
    for name in names:
        with zipfile.ZipFile(scratch / name) as archive:
            if archive.testzip():
                raise RuntimeError('ZIP integrity check failed: ' + name)
    destination.mkdir(parents=True, exist_ok=True)
    for name in names:
        # Publish only completed, checked archives; refuse to replace another process's output.
        with (scratch / name).open('rb') as src, (destination / name).open('xb') as dst:
            while chunk := src.read(1024 * 1024):
                dst.write(chunk)
    print(as_json({'output': str(destination), **notes}))


if __name__ == '__main__':
    main()
