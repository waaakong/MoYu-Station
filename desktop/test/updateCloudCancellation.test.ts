import { describe, expect, it, vi } from 'vitest';
import { CloudClient } from '../src/main/cloud/client';

const origin = 'https://update.example.test';
const json = (data: unknown) => new Response(JSON.stringify(data));
const check = (client: CloudClient, signal: AbortSignal) => client.updateCheck(origin + '/api/client-updates/check', { method: 'POST', body: '{}', signal });

describe('updater cloud cancellation', () => {
  it('does not fetch CSRF or an offer for an already aborted check', async () => {
    const fetcher = vi.fn();
    const client = new CloudClient(origin, fetcher, async () => {}, () => {});
    const controller = new AbortController(); controller.abort();
    await expect(check(client, controller.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    client.dispose();
  });

  it('forwards cancellation through the authenticated cloud adapter', async () => {
    let requestSignal: AbortSignal | undefined;
    const client = new CloudClient(origin, async (url, init) => {
      if (url.endsWith('/auth/csrf')) return json({ data: { token: 'fixture' } });
      requestSignal = init!.signal!;
      return new Promise<Response>((_, reject) => requestSignal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
    }, async () => {}, () => {});
    const controller = new AbortController();
    const pending = check(client, controller.signal);
    const rejection = expect(pending).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(requestSignal).toBeDefined());
    controller.abort(); await rejection;
    expect(requestSignal!.aborted).toBe(true);
    client.dispose();
  });

  it('does not abort shared CSRF acquisition or a different check', async () => {
    let completeCsrf!: (response: Response) => void;
    let csrfSignal: AbortSignal | undefined;
    let offers = 0;
    const client = new CloudClient(origin, async (url, init) => {
      if (url.endsWith('/auth/csrf')) {
        csrfSignal = init!.signal!;
        return new Promise<Response>(resolve => { completeCsrf = resolve; });
      }
      offers++; return json({ success: true, data: { status: 'not_available' } });
    }, async () => {}, () => {});
    const controller = new AbortController();
    const first = check(client, controller.signal);
    const rejected = expect(first).rejects.toThrow('CLOUD_SESSION_CHANGED');
    const second = check(client, new AbortController().signal);
    controller.abort();
    expect(csrfSignal!.aborted).toBe(false);
    completeCsrf(json({ data: { token: 'fixture' } }));
    await rejected; expect((await second).status).toBe(200); expect(offers).toBe(1);
    client.dispose();
  });
});
