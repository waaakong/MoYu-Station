// Isolated test executor only: production adapters never accept these URLs/actions.
import { ProviderWorkerRuntime } from '../src/providers/core/providerWorkerRuntime';
import { ProviderError } from '../src/providers/core/providerErrors';
const port = (process as unknown as { parentPort: { postMessage(value: unknown): void; on(event: string, listener: (event: {data: unknown}) => void): void } }).parentPort;
const runtime = new ProviderWorkerRuntime(async (request, signal) => {
  const payload = request.payload as { action?: string; url?: string; code?: ConstructorParameters<typeof ProviderError>[0] };
  if (payload.action === 'crash') process.exit(23);
  if (payload.action === 'error') throw new ProviderError(payload.code!);
  if (payload.action === 'oversize') return 'x'.repeat(1024 * 1024);
  const response = await fetch(payload.url!, {signal});
  return response.text();
}, response => port.postMessage(response), () => process.exit(0));
port.on('message', event => { void runtime.receive(event.data); });
