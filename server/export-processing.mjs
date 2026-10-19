import { Worker } from 'node:worker_threads';
// Reuse a lightweight worker; serialize heavy decodes to keep saves and polls responsive.
export function createExportProcessing({
  workerURL = new URL('./export-media-worker.mjs', import.meta.url),
  timeoutMs = 15 * 60_000,
  idleMs = 30_000,
} = {}) {
  let worker,
    active,
    timer,
    idleTimer,
    sequence = 0,
    closed = false;
  const queue = [];
  const dropWorker = () => {
    const old = worker;
    worker = undefined;
    clearTimeout(idleTimer);
    if (old) void old.terminate();
  };
  const finish = (error, result, recycle = false) => {
    const job = active;
    active = undefined;
    clearTimeout(timer);
    if (error || recycle) dropWorker();
    if (job) {
      if (error) job.reject(error);
      else job.resolve(result);
    }
    if (!closed) pump();
  };
  const pump = () => {
    if (closed || active) return;
    if (!queue.length) {
      worker?.unref();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(dropWorker, idleMs);
      idleTimer.unref();
      return;
    }
    clearTimeout(idleTimer);
    active = queue.shift();
    try {
      if (!worker) {
        const current = new Worker(workerURL);
        worker = current;
        current.on('message', (message) => {
          if (worker !== current || message.id !== active?.id) return;
          finish(
            message.error ? Error(message.error) : null,
            message.result,
            message.recycle,
          );
        });
        current.on('error', (error) => {
          if (worker === current) finish(error);
        });
        current.on('exit', (code) => {
          if (worker === current)
            finish(
              Error(
                `Media processing stopped (worker exit ${code}). Retry or reduce this file size.`,
              ),
            );
        });
      }
      worker.ref();
      timer = setTimeout(
        () =>
          finish(
            Error(
              'Media processing exceeded 15 minutes. Compress this file and retry.',
            ),
          ),
        timeoutMs,
      );
      worker.postMessage({
        id: active.id,
        kind: active.kind,
        file: active.file,
        omitUnchangedData: active.omitUnchangedData,
      });
    } catch (error) {
      finish(error);
    }
  };
  return {
    run(kind, file, { omitUnchangedData = false } = {}) {
      if (closed)
        return Promise.reject(Error('Export server is shutting down.'));
      return new Promise((resolve, reject) => {
        queue.push({
          id: ++sequence,
          kind,
          file,
          omitUnchangedData,
          resolve,
          reject,
        });
        pump();
      });
    },
    close() {
      closed = true;
      clearTimeout(timer);
      const error = Error('Export server is shutting down.');
      active?.reject(error);
      active = undefined;
      for (const job of queue.splice(0)) job.reject(error);
      dropWorker();
    },
  };
}
