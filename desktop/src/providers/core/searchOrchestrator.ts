import { randomUUID } from "node:crypto";
import type {
  AggregatedSearchPage,
  AggregatedTrack,
  ProviderErrorCode,
  ProviderId,
  ProviderSearchPage,
  ProviderTrackRef
} from "@studyroom/contracts";
import { matchTracks } from "./trackMatcher";

export interface ProviderSearchProgress {
  queryId: string;
  providerId: ProviderId;
  page?: ProviderSearchPage;
  errorCode?: ProviderErrorCode;
}

export type ProviderSearchRunner = (
  providerId: ProviderId,
  query: string,
  pageSize: number,
  signal: AbortSignal
) => Promise<ProviderTrackRef[]>;

function aggregate(candidates: ProviderTrackRef[]): AggregatedTrack[] {
  const groups: AggregatedTrack[] = [];
  for (const candidate of candidates) {
    let best: { group: AggregatedTrack; score: number; confidence: AggregatedTrack["matchConfidence"] } | undefined;
    let possible: { score: number; basis: "isrc" | "metadata" } | undefined;
    for (const group of groups) {
      const anchor = group.candidates[0];
      if (!anchor || group.candidates.some((entry) => entry.providerId === candidate.providerId)) continue;
      const match = matchTracks(anchor, candidate);
      if (match.confidence === "possible") {
        if (!possible || match.score > possible.score) possible = { score: match.score, basis: match.basis === "isrc" ? "isrc" : "metadata" };
        continue;
      }
      if (match.confidence === "separate") continue;
      if (!best || match.score > best.score) best = { group, score: match.score, confidence: match.confidence };
    }
    if (!best) {
      groups.push({
        id: `aggregate:${candidate.id}`,
        title: candidate.title,
        artists: candidate.artists,
        album: candidate.album,
        durationMs: candidate.durationMs,
        matchConfidence: possible ? "possible" : "separate",
        candidates: [{
          ...candidate,
          matchBasis: possible?.basis ?? (candidate.isrc ? "isrc" : "unmatched"),
          matchScore: possible?.score ?? 1
        }]
      });
      continue;
    }
    const anchor = best.group.candidates[0];
    const basis = anchor?.isrc && candidate.isrc === anchor.isrc ? "isrc" : "metadata";
    best.group.candidates.push({ ...candidate, matchBasis: basis, matchScore: best.score });
    best.group.matchConfidence = best.confidence;
  }
  return groups;
}

export class SearchOrchestrator {
  private active?: AbortController;

  constructor(
    private readonly runSearch: ProviderSearchRunner,
    private readonly onProgress?: (event: ProviderSearchProgress) => void,
    private readonly timeoutMs = 8_000
  ) {}

  async search(query: string, providers: ProviderId[], pageSize = 30): Promise<AggregatedSearchPage> {
    this.active?.abort("superseded");
    const controller = new AbortController();
    this.active = controller;
    const queryId = randomUUID();
    const timer = setTimeout(() => controller.abort("timeout"), this.timeoutMs);
    const candidates: ProviderTrackRef[] = [];
    const completedProviders: ProviderId[] = [];
    const failedProviders: Partial<Record<ProviderId, ProviderErrorCode>> = {};
    const tasks = providers.map(async (providerId) => {
      try {
        const items = await this.runSearch(providerId, query, pageSize, controller.signal);
        if (controller.signal.aborted) return;
        candidates.push(...items);
        completedProviders.push(providerId);
        this.onProgress?.({
          queryId,
          providerId,
          page: {
            providerId,
            items: items.map((item) => ({
              id: item.id,
              title: item.title,
              artist: item.artists.join(" / "),
              album: item.album,
              durationMs: item.durationMs,
              source: { kind: "provider", providerId: item.providerId, trackId: item.trackId },
              providerCandidates: [item],
              selectedProviderId: item.providerId
            })),
            fromCache: false
          }
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const code = error instanceof Error && error.message.startsWith("PROVIDER_")
          ? error.message as ProviderErrorCode
          : "PROVIDER_UNAVAILABLE";
        failedProviders[providerId] = code;
        this.onProgress?.({ queryId, providerId, errorCode: code });
      }
    });
    const aborted = new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve(), { once: true }));
    await Promise.race([Promise.all(tasks).then(() => undefined), aborted]);
    if (controller.signal.reason === "timeout") {
      for (const providerId of providers) {
        if (completedProviders.includes(providerId) || failedProviders[providerId]) continue;
        failedProviders[providerId] = "PROVIDER_TIMEOUT";
        this.onProgress?.({ queryId, providerId, errorCode: "PROVIDER_TIMEOUT" });
      }
    }
    clearTimeout(timer);
    if (this.active === controller) this.active = undefined;
    return { items: aggregate(candidates), completedProviders, failedProviders };
  }

  cancel(): void { this.active?.abort("canceled"); }
}

export { aggregate as aggregateProviderTracks };
