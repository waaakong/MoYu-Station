import { type ProviderWorkerResponse } from "./core/providerWorkerProtocol";
import { ProviderWorkerRuntime } from "./core/providerWorkerRuntime";
import { ProviderError } from "./core/providerErrors";
import { NeteaseApi } from "./adapters/netease/api";
import { QQAccountApi } from "./adapters/qq/accountApi";
import { KugouAccountApi } from "./adapters/kugou/accountApi";

interface UtilityParentPort {
  on(event: "message", listener: (event: { data: unknown }) => void): void;
  postMessage(message: ProviderWorkerResponse): void;
}

const parentPort = (process as typeof process & { parentPort?: UtilityParentPort }).parentPort;

if (parentPort) {
  const netease = new NeteaseApi();
  const qq = new QQAccountApi();
  const kugou = new KugouAccountApi();
  const runtime = new ProviderWorkerRuntime(
    async (request, signal) => {
      if (request.providerId === "netease") return netease.execute(request.operation, request.payload, signal);
      if (request.providerId === "qq") return qq.execute(request.operation, request.payload, signal);
      if (request.providerId === "kugou") return kugou.execute(request.operation, request.payload, signal);
      throw new ProviderError("PROVIDER_API_CHANGED");
    },
    response => parentPort.postMessage(response),
    () => process.exit(0)
  );
  parentPort.on("message", event => { void runtime.receive(event.data); });
}
