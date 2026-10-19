import { mkdir, readFile, writeFile, cp, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Ship locked, prebuilt native binaries: the VPS needs no npm install or compiler.
export async function packageImageRuntime(root, out) {
  const source = path.join(root, 'server/image-runtime');
  const lock = await readFile(path.join(source, 'package-lock.json'));
  const hash = createHash('sha256').update(lock).digest('hex');
  const npm = process.env.npm_execpath;
  if (!npm) throw Error('Build the native runtime with npm run build.');
  const targets = new Set([
    'linux-x64',
    'linux-arm64',
    `${process.platform}-${process.arch}`,
  ]);
  for (const target of targets) {
    const [os, cpu] = target.split('-');
    const stage = path.join(root, 'work/image-runtime', `${target}-${hash}`);
    const marker = path.join(stage, '.complete');
    if (
      !(await access(marker).then(
        () => true,
        () => false,
      ))
    ) {
      await mkdir(stage, { recursive: true });
      for (const file of ['package.json', 'package-lock.json'])
        await cp(path.join(source, file), path.join(stage, file));
      execFileSync(
        process.execPath,
        [
          npm,
          'ci',
          '--prefix',
          stage,
          '--ignore-scripts',
          '--include=optional',
          '--no-audit',
          '--no-fund',
          '--fetch-retries=0',
          '--fetch-timeout=30000',
          `--os=${os}`,
          `--cpu=${cpu}`,
          ...(os === 'linux' ? ['--libc=glibc'] : []),
        ],
        { stdio: 'inherit' },
      );
      await access(
        path.join(stage, `node_modules/@img/sharp-${target}/package.json`),
      );
      if (os === 'linux')
        await access(
          path.join(
            stage,
            `node_modules/@img/sharp-libvips-${target}/package.json`,
          ),
        );
      await writeFile(marker, hash);
    }
    await cp(stage, path.join(out, target), {
      recursive: true,
      filter: (file) => !['.complete', '.bin'].includes(path.basename(file)),
    });
  }
  await cp(path.join(source, 'notices'), path.join(out, 'notices'), { recursive: true });
}
