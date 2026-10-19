export type ExportJob = {
  state: 'queued' | 'preparing' | 'ready' | 'failed';
  statusURL: string;
  message: string;
  completed?: number;
  total?: number;
  result?: Record<string, unknown>;
  error?: string;
  errorStatus?: number;
  mediaIssues?: unknown[];
};
export class ExportRequestError extends Error {
  constructor(
    message: string,
    public status = 0,
    public mediaIssues: unknown[] = [],
    public terminal = false,
  ) {
    super(message);
  }
}
export async function readExportResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const type = response.headers.get('content-type') || '';
  const status = response.status;
  if (!/application\/(?:[a-z0-9.+-]*\+)?json/i.test(type)) {
    let login = false;
    try {
      login = /\/cdn-cgi\/access\/|\/auth\/|\/login(?:\/|$)/.test(
        new URL(response.url).pathname,
      );
    } catch {
      /* Synthetic responses have no URL. */
    }
    const message =
      login || status === 401
        ? 'Your sign-in session expired. Sign in again, then retry export.'
        : [408, 504, 524].includes(status)
          ? `Export preparation exceeded the proxy time limit (HTTP ${status}). This is not a sign-in error. Update the server and reload the editor to use background exports.`
          : [502, 503, 520, 521, 522, 523].includes(status)
            ? `The export backend could not be reached (HTTP ${status}). The server may be restarting; retry shortly or check the prion service.`
            : status === 403
              ? 'The proxy denied the export request (HTTP 403). Check your session and Cloudflare Access permissions.'
              : status === 429
                ? 'The proxy is rate-limiting export requests (HTTP 429). Wait a moment and retry.'
                : `The export endpoint returned ${status === 200 ? 'a webpage instead of JSON' : 'HTTP ' + status} (${type.split(';')[0] || 'no content type'}). Check that the editor and server were updated together, then reload the editor.`;
    throw new ExportRequestError(message, status);
  }
  let result: Record<string, unknown>;
  try {
    result = await response.json();
  } catch (error) {
    if (
      error instanceof Error &&
      ['TimeoutError', 'AbortError'].includes(error.name)
    )
      throw error;
    throw new ExportRequestError(
      `The export response was incomplete or invalid (HTTP ${status}). Retry the same export.`,
      status,
    );
  }
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new ExportRequestError(
      'The export server returned an invalid response.',
      status,
    );
  if (!response.ok)
    throw new ExportRequestError(
      typeof result.error === 'string'
        ? result.error
        : `Export failed (HTTP ${status}).`,
      status,
      Array.isArray(result.mediaIssues) ? result.mediaIssues : [],
    );
  return result;
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function prepareExport({
  fetcher,
  body,
  resumeURL,
  onJob,
  onProgress,
  active,
  pollMs = 2000,
}: {
  fetcher: (url: string, options?: RequestInit) => Promise<Response>;
  body: { team: string; requiredPages: string[]; requestId: string };
  resumeURL?: string;
  onJob: (url: string) => void;
  onProgress: (message: string) => void;
  active: () => boolean;
  pollMs?: number;
}): Promise<Record<string, unknown> | null> {
  const validStatusURL = (url: unknown): url is string =>
    typeof url === 'string' && /^\/api\/export\/jobs\/[a-f0-9-]{36}$/.test(url);
  let statusURL = resumeURL;
  if (statusURL && !validStatusURL(statusURL))
    throw new ExportRequestError(
      'Invalid export status URL. Prepare a fresh export.',
    );
  if (!statusURL) {
    onProgress('Starting export preparation…');
    let response;
    let result;
    try {
      response = await fetcher('/api/export/bundles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'respond-async',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25_000),
      });
      result = await readExportResponse(response);
    } catch (error) {
      if (
        error instanceof Error &&
        ['TimeoutError', 'AbortError'].includes(error.name)
      )
        throw new ExportRequestError(
          'The server did not acknowledge the export within 25 seconds. Retry to reconnect to the same request. Your saved content is unchanged.',
          504,
        );
      throw error;
    }
    if (response.status !== 202) {
      if (!Array.isArray(result.downloads))
        throw new ExportRequestError(
          'The export server returned no downloads. Update the server and reload the editor.',
        );
      return result;
    }
    if (!validStatusURL(result.statusURL))
      throw new ExportRequestError(
        'The export server returned an invalid job URL. Update the server and reload the editor.',
      );
    statusURL = result.statusURL;
    onJob(statusURL);
  }
  let failures = 0;
  while (active()) {
    try {
      const result = (await readExportResponse(
        await fetcher(statusURL, {
          cache: 'no-store',
          signal: AbortSignal.timeout(20_000),
        }),
      )) as unknown as ExportJob;
      failures = 0;
      if (!active()) return null;
      if (result.state === 'failed')
        throw new ExportRequestError(
          result.error || 'Export preparation failed.',
          result.errorStatus || 500,
          result.mediaIssues || [],
          true,
        );
      if (result.state === 'ready') {
        if (!result.result || !Array.isArray(result.result.downloads))
          throw new ExportRequestError(
            'The completed export has no download links. Prepare a fresh export.',
          );
        return result.result;
      }
      if (!['queued', 'preparing'].includes(result.state))
        throw new ExportRequestError(
          'The export server returned an unknown job state.',
        );
      onProgress(result.message || 'Preparing your saved project…');
    } catch (error) {
      // Polling can resume the existing job after a transient proxy/network error.
      const retryable =
        error instanceof ExportRequestError
          ? !error.terminal &&
            [502, 503, 504, 520, 521, 522, 523, 524].includes(error.status)
          : error instanceof Error &&
            ['TypeError', 'TimeoutError', 'AbortError'].includes(error.name);
      if (!retryable) throw error;
      if (++failures > 5)
        throw new ExportRequestError(
          'The connection to export progress timed out. Preparation may still be running on the server. Click Prepare again to reconnect to the same job; it will not restart the image checks.',
          504,
        );
      onProgress(
        'Reconnecting to export progress… Your existing job is still being checked.',
      );
    }
    await pause(pollMs);
  }
  return null;
}
