export async function uploadMedia(
  file: File,
  progress: (value: number) => void,
): Promise<{ url: string; type: string }> {
  if (file.size < 16) throw Error('Choose a file of at least 16 bytes.');
  let timeout = 180000;
  let destination = '/api/media?name=' + encodeURIComponent(file.name);
  let response: Response;
  try {
    response = await fetch('/api/media-ticket', {
      credentials: 'same-origin',
      redirect: 'manual',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, size: file.size }),
    });
  } catch {
    throw Error(
      'Could not authorize the upload. Refresh and sign in through Cloudflare Access, then try again.',
    );
  }
  if (
    response.type === 'opaqueredirect' ||
    (response.status >= 300 && response.status < 400) ||
    response.status === 401
  )
    throw Error(
      'Your upload session expired. Refresh and sign in through Cloudflare Access again.',
    );
  if (response.status !== 404) {
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw Error(
        'The upload API returned a proxy or login page. Refresh and sign in; if this persists, check the prion service and Nginx configuration.',
      );
    const ticket = (await response.json()) as {
      url?: string;
      error?: string;
      timeoutMs?: number;
    };
    if (!response.ok || !ticket.url)
      throw Error(ticket.error || 'Could not authorize upload.');
    if (!ticket.url.startsWith('https://'))
      throw Error('Upload requires HTTPS.');
    destination = ticket.url;
    timeout = ticket.timeoutMs || 1800000;
  }
  if (destination.startsWith('/api/') && file.size > 25 * 1024 * 1024)
    throw Error(
      'Large files require the direct media hostname. Ask an administrator to configure MEDIA_ORIGIN.',
    );
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', destination);
    xhr.timeout = timeout;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () =>
      reject(
        Error(
          'The media upload was blocked or unreachable. Refresh and sign in again. If it persists, check the media hostname and CORS configuration.',
        ),
      );
    xhr.ontimeout = () => reject(Error('Upload timed out. Please retry.'));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300)
          reject(Error(data.error || 'Upload failed.'));
        else resolve(data);
      } catch {
        reject(
          Error('Your session may have expired. Sign in again and retry.'),
        );
      }
    };
    xhr.send(file);
  });
}
