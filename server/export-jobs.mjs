import { randomUUID } from 'node:crypto';
const fail = (status, message) => Object.assign(Error(message), { status });
// Authenticated, project-scoped short polling requests replace the long POST.
export function createExportJobs({ prepare, now = Date.now }) {
  const jobs = new Map();
  let closed = false;
  const prune = () => {
    for (const [id, job] of jobs)
      if (job.expires <= now() && !['queued', 'preparing'].includes(job.state))
        jobs.delete(id);
  };
  const view = (job) => ({
    id: job.id,
    state: job.state,
    message: job.message,
    completed: job.completed,
    total: job.total,
    statusURL: `/api/export/jobs/${job.id}`,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error
      ? {
          error: job.error,
          errorStatus: job.errorStatus,
          mediaIssues: job.mediaIssues,
        }
      : {}),
  });
  return {
    start(args, requestId) {
      if (closed)
        throw fail(503, 'Export server is restarting. Retry shortly.');
      if (!/^[a-f0-9-]{36}$/.test(requestId || ''))
        throw fail(
          400,
          'A valid export request ID is required. Refresh the editor.',
        );
      prune();
      const existing = [...jobs.values()].find(
        (job) =>
          job.userId === args.userId &&
          job.projectId === args.project.id &&
          job.requestId === requestId,
      );
      if (existing) return view(existing);
      for (const old of [...jobs.values()]
        .filter(
          (job) =>
            job.userId === args.userId &&
            job.projectId === args.project.id &&
            !['queued', 'preparing'].includes(job.state),
        )
        .slice(0, -1))
        jobs.delete(old.id);
      if (
        [...jobs.values()].filter((job) =>
          ['queued', 'preparing'].includes(job.state),
        ).length >= 2 ||
        jobs.size >= 24
      )
        throw fail(
          429,
          'Two exports are already preparing, or too many recent exports are retained. Wait and retry.',
        );
      const job = {
        id: randomUUID(),
        userId: args.userId,
        projectId: args.project.id,
        requestId,
        state: 'queued',
        message: 'Waiting to prepare your saved project…',
        completed: 0,
        total: 0,
        expires: now() + 30 * 60_000,
      };
      jobs.set(job.id, job);
      setImmediate(async () => {
        if (closed) return;
        job.state = 'preparing';
        try {
          job.result = await prepare({
            ...args,
            onProgress: (progress) => Object.assign(job, progress),
          });
          job.state = 'ready';
          job.message = 'Your downloads are ready.';
        } catch (error) {
          job.state = 'failed';
          job.errorStatus = error.status || 500;
          job.error = error.status
            ? error.message
            : 'Export preparation failed on the server. Retry, or ask the administrator to check the prion service logs.';
          if (!error.status) console.error('Export job failed:', error);
          if (error.status === 422 && Array.isArray(error.mediaIssues))
            job.mediaIssues = error.mediaIssues;
        } finally {
          job.expires = now() + 30 * 60_000;
        }
      });
      return view(job);
    },
    get({ id, userId, projectId }) {
      prune();
      const job = jobs.get(id);
      if (!job || job.userId !== userId || job.projectId !== projectId)
        throw fail(
          404,
          'Export preparation expired or the server restarted. Prepare a fresh export.',
        );
      return view(job);
    },
    close() {
      closed = true;
      jobs.clear();
    },
  };
}
