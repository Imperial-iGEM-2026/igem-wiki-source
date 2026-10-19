import { fork } from 'node:child_process';
export function runNativeImage(file, options = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(
      new URL('./image-native-child.mjs', import.meta.url),
      [],
      {
        execArgv: ['--max-old-space-size=64'],
        serialization: 'advanced',
        silent: true,
        env: { ...process.env, UV_THREADPOOL_SIZE: '1', MALLOC_ARENA_MAX: '2' },
      },
    );
    let message,
      timedOut = false,
      stderr = '';
    child.stdout.resume();
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2048);
    });
    const timeout = setTimeout(
      () => {
        timedOut = true;
        child.kill();
      },
      options.timeoutMs || 5 * 60_000,
    );
    child.on('message', (value) => {
      message = value;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut)
        reject(
          Error(
            options.previewSize
              ? 'Image preview timed out. Use a smaller image for editing.'
              : 'Image processing exceeded five minutes. Use a smaller export copy and retry.',
          ),
        );
      else if (message?.error) reject(Error(message.error));
      else if (code === 0 && message?.result)
        resolve({ ...message.result, peakRssKiB: message.peakRssKiB });
      else
        reject(
          Error(
            `Image processor stopped (${signal || code}). ${/Cannot find module|Could not load|ERR_MODULE_NOT_FOUND/.test(stderr) ? 'Install the complete updated server package, including its native image runtime.' : 'The server may be short of memory. Try a smaller export copy; this is not evidence of image corruption.'}`,
          ),
        );
    });
    child.send({ file, options });
  });
}
