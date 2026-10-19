import { CANDIDATE_LIMITS, CandidateError, type CandidateCode } from "./candidateContainer";
import type { PreparedCandidate } from "./candidateProcessor";
import type { UploadJob } from "./imageUploadQueue";

type CandidateWorker = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror">;
const codes: CandidateCode[] = ["MEDIA_INVALID", "MEDIA_TYPE", "MEDIA_SIZE", "MEDIA_DIMENSIONS", "MEDIA_ANIMATED", "MEDIA_COLOR",
  "MEDIA_OUTPUT_SIZE", "MEDIA_UNSUPPORTED", "MEDIA_TIMEOUT"];
const aborted = () => new DOMException("图片处理已取消。", "AbortError");

/** Global serial admission also covers direct callers outside ImageUploadQueue. */
export function createCandidatePreparer(makeWorker: () => CandidateWorker, timeoutMs = 15000) {
  let active = false;
  const waiting: Array<() => void> = [];
  const drain = () => { if (!active && waiting.length) waiting.shift()!(); };
  return (file: File, signal: AbortSignal): Promise<PreparedCandidate> => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(aborted()); return; }
    if (!file.size || file.size > CANDIDATE_LIMITS.inputBytes) { reject(new CandidateError("MEDIA_SIZE")); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { reject(new CandidateError("MEDIA_TYPE")); return; }
    let worker: CandidateWorker | undefined, timer: ReturnType<typeof setTimeout> | undefined, started = false, settled = false;
    const finish = (error?: Error, result?: PreparedCandidate) => {
      if (settled) return; settled = true;
      signal.removeEventListener("abort", cancel); clearTimeout(timer);
      if (worker) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); }
      const position = waiting.indexOf(start); if (position >= 0) waiting.splice(position, 1);
      if (started) active = false;
      if (error) reject(error); else resolve(result!);
      drain();
    };
    const cancel = () => finish(aborted());
    const start = () => {
      if (signal.aborted) { finish(aborted()); return; }
      active = true; started = true;
      try {
        worker = makeWorker();
        worker.onmessage = event => {
          if (signal.aborted) { finish(aborted()); return; }
          const message = event.data;
          if (!message?.ok) { finish(new CandidateError(codes.includes(message?.code) ? message.code : "MEDIA_INVALID")); return; }
          const result = message.result as PreparedCandidate;
          if (!(result?.file instanceof File) || !["image/png", "image/webp"].includes(result.file.type) || result.file.size <= 0
            || result.file.size > CANDIDATE_LIMITS.outputBytes || result.outputBytes !== result.file.size || result.originalBytes !== file.size
            || !Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height) || Math.min(result.width, result.height) <= 0
            || Math.max(result.width, result.height) > (Math.max(result.width, result.height) >= 3 * Math.min(result.width, result.height) ? 4096 : 2560)) {
            finish(new CandidateError("MEDIA_INVALID")); return;
          }
          finish(undefined, result);
        };
        worker.onerror = event => { event.preventDefault(); finish(new CandidateError("MEDIA_INVALID")); };
        worker.onmessageerror = () => finish(new CandidateError("MEDIA_INVALID"));
        timer = setTimeout(() => finish(new CandidateError("MEDIA_TIMEOUT")), timeoutMs);
        worker.postMessage(file);
      } catch { finish(new CandidateError("MEDIA_UNSUPPORTED")); }
    };
    signal.addEventListener("abort", cancel, { once: true }); waiting.push(start); drain();
  });
}

export const prepareCandidate = createCandidatePreparer(() => new Worker(new URL("./candidate.worker.ts", import.meta.url), { type: "module" }));
export async function prepareCandidateForUpload(file: File, job: UploadJob): Promise<File> {
  return (await prepareCandidate(file, job.signal)).file;
}
