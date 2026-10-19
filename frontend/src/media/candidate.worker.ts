import { CandidateError } from "./candidateContainer";
import { processCandidate } from "./candidateProcessor";

// One file per worker; the owning client always terminates it after its first result.
let started = false;
self.onmessage = async (event: MessageEvent<File>) => {
  if (started) return;
  started = true;
  try {
    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") throw new CandidateError("MEDIA_UNSUPPORTED");
    const result = await processCandidate(event.data);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, code: error instanceof CandidateError ? error.code : "MEDIA_INVALID" });
  }
};
