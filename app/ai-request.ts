import { projectFetch } from './project-api';
export type AiActivity = {
  type: 'progress';
  id?: string;
  phase: string;
  state: 'running' | 'complete';
};
export const activityLabels: Record<string, string> = {
  connecting: 'Connecting',
  starting: 'Starting Codex',
  thinking: 'Thinking',
  responding: 'Writing response',
  validating: 'Checking proposed changes',
  command: 'Command',
  file: 'File changes',
  tool: 'Tool call',
  search: 'Web search',
  planning: 'Planning',
};
/** AI endpoints return JSON; never display a proxy/login HTML document as an error. */
export async function aiRequest<T>(
  route: string,
  options: RequestInit = {},
  onProgress?: (event: AiActivity) => void,
): Promise<T> {
  let response: Response;
  try {
    response = await projectFetch(route, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
      headers: {
        ...Object.fromEntries(new Headers(options.headers)),
        Accept: onProgress ? 'application/x-ndjson' : 'application/json',
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw Error(
      `Could not reach the AI endpoint (${route}). Check your connection, then refresh and sign in again. Your request has not been retried.`,
    );
  }
  const reference = `${route}, HTTP ${response.status}`;
  if (
    response.type === 'opaqueredirect' ||
    response.redirected ||
    (response.status >= 300 && response.status < 400)
  ) {
    await response.body?.cancel();
    throw Error(
      `The AI request was redirected to another page. Refresh and sign in through Cloudflare Access again. (${route})`,
    );
  }
  const contentType = response.headers.get('content-type') || '';
  let data: unknown;
  if (response.ok && contentType.includes('application/x-ndjson')) {
    const reader = response.body?.getReader();
    if (!reader) throw Error('The AI response stream was empty.');
    const decoder = new TextDecoder();
    let pending = '',
      size = 0,
      received = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        size += value?.byteLength || 0;
        if (size > 1000000) throw Error('The AI response was too large.');
        let newline;
        while ((newline = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            throw Error('The AI response stream was invalid.');
          }
          if (event.type === 'error')
            throw Error(
              typeof event.error === 'string'
                ? event.error
                : 'AI request failed.',
            );
          if (
            event.type === 'progress' &&
            Object.hasOwn(activityLabels, event.phase) &&
            ['running', 'complete'].includes(event.state)
          )
            onProgress?.({
              type: 'progress',
              phase: event.phase,
              state: event.state,
              ...(typeof event.id === 'string' && /^\d{1,6}$/.test(event.id)
                ? { id: event.id }
                : {}),
            });
          if (event.type === 'result') {
            data = event.data;
            received = true;
          }
        }
        if (done) break;
      }
      if (!received || !data || typeof data !== 'object' || Array.isArray(data))
        throw Error(
          'The AI connection ended before a complete response arrived. Your page was not changed.',
        );
      return data as T;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  if (/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
    try {
      data = await response.json();
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw Error(
        `The AI endpoint returned invalid JSON (${reference}). Ask the administrator to check the running server release.`,
      );
    }
  } else {
    await response.body?.cancel();
  }
  if (!response.ok || data === undefined) {
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof data.error === 'string'
    )
      throw Error(`${data.error.slice(0, 2000)} (${reference})`);
    const reason =
      response.status === 401 || response.status === 403
        ? 'Access denied. Refresh and sign in again. If it continues, the administrator should check Cloudflare Access and security events for this request.'
        : response.status === 404 || response.status === 405
          ? 'The AI endpoint is missing or routed incorrectly. Update the backend together with the frontend and restart prion.'
          : response.status === 413
            ? 'The proxy rejected the request size. Try selecting a smaller section and check the Nginx API body limit.'
            : response.status === 429
              ? 'Too many requests. Wait before sending again.'
              : response.status === 504 || response.status === 524
                ? 'The proxy timed out waiting for AI. Check the AI service and Nginx timeout configuration.'
                : [502, 503, 520, 521, 522, 523].includes(response.status)
                  ? 'The proxy could not reach a working AI backend. Check the prion and prion-codex services.'
                  : 'The AI endpoint returned a web page instead of JSON. Check that /api/ai/ reaches the updated prion backend rather than a login page or static website.';
    throw Error(`${reason} (${reference})`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw Error(`The AI endpoint returned an invalid response (${reference}).`);
  return data as T;
}
