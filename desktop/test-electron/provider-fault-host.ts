import { app, utilityProcess } from 'electron';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProviderWorkerSupervisor } from '../src/providers/core/providerWorkerSupervisor';

app.setPath('userData', join(__dirname, 'isolated-profile'));
const results: {provider: string; checks: string[]}[] = [];
const deadline = setTimeout(() => { console.error('PROVIDER_FAULT_TEST_DEADLINE'); app.exit(1); }, 45000);
void app.whenReady().then(async () => {
  const waiting = new Map<string, {seen(): void; closed(): void}>();
  const server = createServer((request, response) => {
    const entry = waiting.get(request.url!);
    if (!entry) { response.end('healthy'); return; }
    response.on('close', entry.closed);
    entry.seen(); // Deliberately do not respond; cancellation must close this socket.
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const hold = (path: string) => {
    let seen!: () => void, closed!: () => void;
    const received = new Promise<void>(resolve => { seen = resolve; });
    const disconnected = new Promise<void>(resolve => { closed = resolve; });
    waiting.set(path, {seen, closed});
    return {received, disconnected, url: origin + path};
  };
  let current: ProviderWorkerSupervisor | undefined;
  try {
    for (const provider of ['netease', 'qq', 'kugou'] as const) {
      const checks: string[] = [];
      current = new ProviderWorkerSupervisor(provider, () => utilityProcess.fork(join(__dirname, 'provider-fault-worker.cjs')), 2500);
      await current.request('ping');
      const cancel = hold(`/${provider}/cancel`), controller = new AbortController();
      const canceled = assert.rejects(current.request('search', {url: cancel.url}, controller.signal), {name:'AbortError'});
      await cancel.received; controller.abort(); await canceled; await cancel.disconnected;
      checks.push('cancel closes real HTTP socket');
      const timeout = hold(`/${provider}/timeout`);
      const timedOut = assert.rejects(current.request('search', {url: timeout.url}), {code:'PROVIDER_TIMEOUT'});
      await timeout.received; await timedOut; await timeout.disconnected;
      checks.push('timeout closes real HTTP socket');
      const pending = hold(`/${provider}/crash-pending`);
      const interrupted = assert.rejects(current.request('search', {url: pending.url}), {code:'PROVIDER_UNAVAILABLE'});
      await pending.received;
      await assert.rejects(current.request('search', {action:'crash'}), {code:'PROVIDER_UNAVAILABLE'});
      await interrupted; await pending.disconnected;
      assert.deepEqual(await current.request('ping'), {ready:true});
      checks.push('crash rejects concurrent work; next request starts fresh process');
      const controllers = [new AbortController(), new AbortController(), new AbortController()];
      const holds = controllers.map((_, index) => hold(`/${provider}/limit-${index}`));
      const aborted = holds.map((entry, index) => assert.rejects(current!.request('search', {url:entry.url}, controllers[index]!.signal), {name:'AbortError'}));
      await Promise.all(holds.map(entry => entry.received));
      await assert.rejects(current.request('search', {url:origin}), {code:'PROVIDER_RATE_LIMITED'});
      controllers.forEach(item => item.abort()); await Promise.all(aborted); await Promise.all(holds.map(entry => entry.disconnected));
      checks.push('fourth concurrent request rejected; three canceled sockets close');
      // Network-close notification may precede the worker finally block by one turn.
      current.dispose(); current = new ProviderWorkerSupervisor(provider, () => utilityProcess.fork(join(__dirname, 'provider-fault-worker.cjs')), 2500);
      for (const code of ['PROVIDER_SESSION_EXPIRED', 'PROVIDER_RIGHTS_RESTRICTED', 'PROVIDER_API_CHANGED'] as const) {
        await assert.rejects(current.request('search', {action:'error', code}), {code});
      }
      checks.push('session/rights/schema errors preserved without raw error details');
      await assert.rejects(current.request('search', {action:'oversize'}), {code:'PROVIDER_API_CHANGED'});
      checks.push('oversized worker response rejected');
      assert.equal(await current.request('search', {url:origin}), 'healthy');
      checks.push('healthy request succeeds after injected failures');
      current.dispose(); current = undefined;
      results.push({provider, checks});
    }
    const result = {passed:true, electron:process.versions.electron, scope:'actual utility processes and loopback HTTP; injected adapter errors, not real platform private-account acceptance', results};
    writeFileSync(join(__dirname, 'provider-fault-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error); process.exitCode = 1;
  } finally {
    current?.dispose(); server.closeAllConnections(); server.close(); clearTimeout(deadline); app.exit(Number(process.exitCode ?? 0));
  }
});
