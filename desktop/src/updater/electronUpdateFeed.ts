import { net, type Session } from 'electron';

const MAX_FEED_BYTES = 128 * 1024;

/** One GET hop. Electron fetch rejects manual redirects instead of exposing 302. */
export function fetchElectronUpdateFeedResponse(url: string, init: RequestInit, session?: Session): Promise<Response> {
  return new Promise((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) { reject(signal.reason); return; }
    let settled = false;
    const request = net.request({ url, method: 'GET', redirect: 'manual', session,
      credentials: 'omit', useSessionCookies: false,
      headers: Object.fromEntries(new Headers(init.headers)) });
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true; cleanup(); reject(error); request.abort();
    };
    const succeed = (response: Response) => {
      if (settled) return;
      settled = true; cleanup(); resolve(response);
    };
    const abort = () => fail(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    request.on('error', fail);
    // Electron 44 can emit request close before its redirect/response event.
    // Transport errors, response aborts and the caller's deadline settle failure.
    request.on('redirect', (status, _method, location) => {
      // Never follow automatically. The caller validates this Location before
      // building the next request with destination-specific credentials.
      if (settled) return;
      try { succeed(new Response(null, { status, headers: { location } })); }
      catch (error) { fail(error); }
      request.abort();
    });
    request.on('response', response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        if (settled) return;
        size += chunk.length;
        if (size > MAX_FEED_BYTES) { fail(new Error('UPDATE_ARTIFACT_HASH_FAILED')); return; }
        chunks.push(chunk);
      });
      response.on('aborted', () => fail(new Error('net::ERR_CONNECTION_CLOSED')));
      response.on('error', fail);
      response.on('end', () => {
        if (settled) return;
        try {
          const status = response.statusCode;
          const body = [204,205,304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks));
          succeed(new Response(body, { status }));
        } catch (error) { fail(error); }
      });
    });
    if (signal?.aborted) abort();
    if (!settled) request.end();
  });
}
