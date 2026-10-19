import { ref } from 'vue';
import type { MediaDraft } from './mediaDraft';

// Deliberately memory-only. Route changes are not account changes; logout is.
// Kept independent of auth so the store can synchronously dispose in-flight work.
export const sessionMediaDrafts = new Map<string, MediaDraft>();
export const mediaDraftRevision = ref(0);
export function clearSessionMediaDrafts() {
  for (const draft of sessionMediaDrafts.values()) draft.dispose();
  sessionMediaDrafts.clear();
  mediaDraftRevision.value++;
}
