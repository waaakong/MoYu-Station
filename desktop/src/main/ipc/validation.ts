import { z } from "zod";
import { ENTERTAINMENT_STATE_IDS, ENTERTAINMENT_TOOL_IDS, PROVIDER_IDS,CLASSIC_GAME_IDS,isClassicGame,type ClassicGame } from "@studyroom/contracts";

const nonnegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const noInputSchema = z.undefined();
export const windowCloseBehaviorSchema = z.enum(["ask", "tray", "quit"]);
export const windowCloseDecisionSchema = z.object({
  id: z.string().uuid(), action: z.enum(["cancel", "tray", "quit"]), remember: z.boolean()
}).strict();
export const windowQuitReadySchema = z.object({ id: z.string().uuid(), ready: z.union([z.boolean(), z.enum(["waiting", "working"])]) }).strict();
export const availableLocalProfileSummarySchema = z.object({
  status: z.literal("available"),
  trackCount: nonnegativeSafeInteger,
  queueItemCount: nonnegativeSafeInteger,
  playlistCount: nonnegativeSafeInteger,
  focusRecordCount: nonnegativeSafeInteger,
  latestFocusAt: nonnegativeSafeInteger.optional(),
  hasEntertainmentSettings: z.boolean(),
  storageBytes: nonnegativeSafeInteger
}).strict();

export const providerIdSchema = z.enum(PROVIDER_IDS);

const localSource = z.object({ kind: z.literal("local"), fileToken: z.string().min(1).max(200) });
const builtinSource = z.object({ kind: z.literal("builtin"), assetId: z.string().min(1).max(200) });
const providerSource = z.object({
  kind: z.literal("provider"),
  providerId: providerIdSchema,
  trackId: z.string().min(1).max(300)
});
const radioSource = z.object({ kind: z.literal("radio"), stationId: z.string().min(1).max(200) });
const trackSource = z.discriminatedUnion("kind", [localSource, builtinSource, providerSource, radioSource]);
const providerTrackRef = z.object({
  id: z.string().min(1).max(300),
  providerId: providerIdSchema,
  trackId: z.string().min(1).max(300),
  title: z.string().min(1).max(500),
  artists: z.array(z.string().min(1).max(300)).min(1).max(20),
  album: z.string().max(500).optional(),
  artworkUrl: z.string().regex(/^studyroom-media:\/\/provider-artwork\/[a-f0-9]{64}$/).optional(),
  durationMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000).optional(),
  isrc: z.string().trim().min(5).max(32).optional(),
  versionTags: z.array(z.string().min(1).max(40)).max(10),
  quality: z.enum(["low", "standard", "high", "lossless", "hi-res", "unknown"]),
  rights: z.enum(["available", "subscription-required", "purchase-required", "region-restricted", "unavailable"]),
  badges: z.array(z.enum(["vip", "purchase", "no-source", "region-restricted"])).max(4).optional(),
  isAvailable: z.boolean(),
  unavailableReason: z.enum([
    "PROVIDER_APP_LOGIN_REQUIRED",
    "PROVIDER_DISABLED", "PROVIDER_LOGIN_REQUIRED", "PROVIDER_SESSION_EXPIRED", "PROVIDER_TIMEOUT",
    "PROVIDER_RATE_LIMITED", "PROVIDER_CIRCUIT_OPEN", "PROVIDER_RIGHTS_RESTRICTED",
    "PROVIDER_REGION_RESTRICTED", "PROVIDER_API_CHANGED", "PROVIDER_UNAVAILABLE"
  ]).optional(),
  matchBasis: z.enum(["isrc", "metadata", "manual", "unmatched"]).optional(),
  matchScore: z.number().min(0).max(1).optional()
}).strict();
const track = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  artist: z.string().min(1).max(500),
  album: z.string().max(500).optional(),
  durationMs: z.number().int().nonnegative().max(24 * 60 * 60 * 1000).optional(),
  artworkUrl: z.string().max(2_000).optional(),
  source: trackSource,
  providerCandidates: z.array(providerTrackRef).max(3).optional(),
  selectedProviderId: providerIdSchema.optional()
}).strict();

const equalizerFrequencies = [31, 62, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000] as const;
const unitInterval = z.number().finite().min(0).max(1);
const ambientTrackSchema = z.object({
  id: z.string().min(1).max(100),
  sourceId: z.enum(["white-noise", "pink-noise", "brown-noise", "rain", "cafe", "fireplace", "waves"]),
  volume: unitInterval,
  pan: z.number().finite().min(-1).max(1),
  muted: z.boolean(),
  solo: z.boolean(),
  fadeInMs: z.number().int().min(0).max(30_000),
  fadeOutMs: z.number().int().min(0).max(30_000),
  randomStart: z.boolean(),
  status: z.enum(["stopped", "loading", "playing", "error"]),
  errorCode: z.string().min(1).max(100).optional()
});
const ambientTracksSchema = z.array(ambientTrackSchema).max(6).superRefine((tracks, context) => {
  const ids = new Set<string>();
  const sources = new Set<string>();
  tracks.forEach((track, index) => {
    if (ids.has(track.id)) context.addIssue({ code: "custom", message: "DUPLICATE_AMBIENT_TRACK_ID", path: [index, "id"] });
    if (sources.has(track.sourceId)) context.addIssue({ code: "custom", message: "DUPLICATE_AMBIENT_SOURCE", path: [index, "sourceId"] });
    ids.add(track.id);
    sources.add(track.sourceId);
  });
});
const equalizerBandsSchema = z.array(z.object({
  frequencyHz: z.number().int().positive(),
  gainDb: z.number().finite().min(-12).max(12)
})).length(10).superRefine((bands, context) => {
  bands.forEach((band, index) => {
    if (band.frequencyHz !== equalizerFrequencies[index]) {
      context.addIssue({ code: "custom", message: "INVALID_EQUALIZER_FREQUENCIES", path: [index, "frequencyHz"] });
    }
  });
});
export const soundSnapshotStateSchema = z.object({
  musicBus: z.object({ volume: unitInterval, muted: z.boolean() }),
  ambientBus: z.object({ volume: unitInterval, muted: z.boolean() }),
  ambientTracks: ambientTracksSchema,
  equalizer: z.object({
    enabled: z.boolean(),
    presetId: z.enum(["flat", "focus", "warm", "bright", "deep", "custom"]),
    bands: equalizerBandsSchema
  }),
  masterProcessing: z.object({
    normalizationEnabled: z.boolean(),
    lowVolumeCompensationEnabled: z.boolean(),
    compressorEnabled: z.boolean()
  }),
  crossfadeSeconds: z.number().finite().min(0).max(12),
  visualizer: z.object({
    mode: z.enum(["cover", "spectrum", "waveform", "particles", "off"]),
    quality: z.enum(["low", "medium", "high"]),
    stage: z.object({
      composition: z.enum(["cover", "lyrics", "visual"]),
      tone: z.enum(["sea", "ember", "moon"]),
      cameraX: z.number().finite().min(-8).max(8),
      cameraY: z.number().finite().min(-6).max(6)
    }).strict().optional()
  })
});

export const soundSettingsSchema = soundSnapshotStateSchema.extend({
  version: z.literal(1),
  outputDeviceId: z.string().min(1).max(500).optional()
});

export const soundSettingsRequestSchema = z.object({ settings: soundSettingsSchema });
export const soundSnapshotRequestSchema = z.object({
  snapshot: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    state: soundSnapshotStateSchema
  })
});
export const soundSnapshotIdRequestSchema = z.object({ snapshotId: z.string().uuid() });
export const renameSoundSnapshotRequestSchema = soundSnapshotIdRequestSchema.extend({
  name: z.string().trim().min(1).max(60)
});

export const queueItemsSchema = z.array(z.object({
  id: z.string().min(1).max(200),
  track,
  queuedAt: z.number().int().nonnegative()
})).max(10_000);

export const focusRecordSchema = z.object({
  activitySessionId: z.string().uuid().optional(),
  clientRecordId: z.string().uuid(),
  startedAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative().optional(),
  plannedMinutes: z.number().int().min(1).max(180),
  completedMinutes: z.number().int().min(0).max(180),
  completedSeconds: z.number().int().min(0).max(10_800).optional(),
  sceneCode: z.enum(["mountain", "beach", "forest", "library", "cafe", "snow"]).optional(),
  timeKey: z.enum(["morning", "forenoon", "noon", "afternoon", "dusk", "night", "midnight"]).optional(),
  status: z.enum(["active", "completed", "canceled"]),
  syncStatus: z.enum(["local", "pending", "synced", "failed"]),
  syncPolicy: z.enum(["automatic", "manual-only"]).optional(),
  accountScope: z.string().trim().min(1).max(100).optional(),
  cloudRecordId: z.union([z.number().int().positive().safe(), z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value => BigInt(value) <= 9223372036854775807n)]).optional(),
  syncError: z.string().trim().max(300).optional()
}).strict();

export const focusRecordListRequestSchema = z.object({
  syncPolicy: z.enum(["automatic", "manual-only"]).optional(),
  limit: z.number().int().min(1).max(10_000).optional()
}).strict();

export const focusWorkspaceRequestSchema = z.object({
  accountScope: z.string().trim().min(1).max(100)
}).strict();

export const focusWorkspaceSchema = focusWorkspaceRequestSchema.extend({
  version: z.literal(1),
  todos: z.array(z.object({
    id: z.string().min(1).max(100),
    text: z.string().trim().min(1).max(500),
    done: z.boolean(),
    updatedAt: z.number().int().nonnegative()
  }).strict()).max(200),
  memoText: z.string().max(20_000),
  updatedAt: z.number().int().nonnegative()
}).strict();

export const entertainmentStateIdSchema = z.enum(ENTERTAINMENT_STATE_IDS);
const entertainmentToolIdSchema = z.enum(ENTERTAINMENT_TOOL_IDS);
const entertainmentPreferencesSchema = z.object({
  version: z.literal(1),
  toolId: z.literal("preferences"),
  soundEnabled: z.boolean(),
  reducedMotion: z.boolean(),
  solidBackground: z.boolean(),
  lastToolId: entertainmentToolIdSchema.optional()
}).strict();
const breathingEntertainmentSchema = z.object({
  version: z.literal(1),
  toolId: z.literal("breathing"),
  elapsedMs: z.number().int().min(0).max(60_000),
  completedRounds: z.number().int().min(0).max(999_999)
}).strict();
const woodenFishEntertainmentSchema = z.object({
  version: z.literal(1),
  toolId: z.literal("wooden-fish"),
  count: z.number().int().min(0).max(999_999_999),
  tempo: z.enum(["slow", "medium", "fast"])
}).strict();
const memoryCardSchema = z.object({
  id: z.string().min(1).max(40),
  symbol: z.string().min(1).max(20),
  matched: z.boolean()
}).strict();
const memoryCardsEntertainmentSchema = z.object({
  version: z.literal(1),
  toolId: z.literal("memory-cards"),
  cards: z.array(memoryCardSchema).max(12),
  revealedIds: z.array(z.string().min(1).max(40)).max(2),
  moves: z.number().int().min(0).max(999_999),
  elapsedMs: z.number().int().min(0).max(24 * 60 * 60 * 1_000),
  status: z.enum(["idle", "playing", "paused", "completed"])
}).strict().superRefine((state, context) => {
  const ids = state.cards.map((card) => card.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "DUPLICATE_MEMORY_CARD" });
  if (state.cards.length !== 0 && state.cards.length !== 12) context.addIssue({ code: "custom", message: "INVALID_MEMORY_CARD_COUNT" });
  if (state.revealedIds.some((id) => !ids.includes(id))) context.addIssue({ code: "custom", message: "UNKNOWN_REVEALED_CARD" });
});
const sortableFishSchema = z.object({
  id: z.string().min(1).max(40),
  color: z.enum(["coral", "gold", "mint"]),
  shape: z.enum(["round", "long", "triangle"]),
  placedPool: z.string().min(1).max(20).optional()
}).strict();
const fishSortingEntertainmentSchema = z.object({
  version: z.literal(1),
  toolId: z.literal("fish-sorting"),
  dimension: z.enum(["color", "shape"]),
  fish: z.array(sortableFishSchema).max(12),
  selectedFishId: z.string().min(1).max(40).optional(),
  status: z.enum(["idle", "playing", "paused", "completed"])
}).strict().superRefine((state, context) => {
  const ids = state.fish.map((fish) => fish.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "DUPLICATE_FISH" });
  if (state.fish.length !== 0 && state.fish.length !== 12) context.addIssue({ code: "custom", message: "INVALID_FISH_COUNT" });
  if (state.selectedFishId && !ids.includes(state.selectedFishId)) context.addIssue({ code: "custom", message: "UNKNOWN_SELECTED_FISH" });
});

export const entertainmentStateSchema = z.union([z.custom<ClassicGame>(isClassicGame),z.discriminatedUnion("toolId", [
  entertainmentPreferencesSchema,
  breathingEntertainmentSchema,
  woodenFishEntertainmentSchema,
  memoryCardsEntertainmentSchema,
  fishSortingEntertainmentSchema
])]);
export const entertainmentStateRequestSchema = z.object({ toolId: entertainmentStateIdSchema }).strict();
export const saveEntertainmentStateRequestSchema = z.object({
  toolId: entertainmentStateIdSchema,
  state: entertainmentStateSchema,
  expected:z.object({generation:z.string().uuid(),revision:z.number().int().nonnegative().safe()}).strict().nullable().optional()
}).strict().superRefine((request, context) => {
  if (request.toolId !== request.state.toolId) context.addIssue({ code: "custom", message: "ENTERTAINMENT_TOOL_MISMATCH" });
  if((CLASSIC_GAME_IDS as readonly string[]).includes(request.toolId) && request.expected===undefined)context.addIssue({code:'custom',message:'GAME_EXPECTED_REVISION_REQUIRED'});
  if (Buffer.byteLength(JSON.stringify(request.state), "utf8") > 32 * 1_024) {
    context.addIssue({ code: "custom", message: "ENTERTAINMENT_STATE_TOO_LARGE" });
  }
});

export const libraryScanSchema = z.object({
  directoryToken: z.string().uuid()
});

export const trackRequestSchema = z.object({
  trackId: z.string().min(1).max(200)
});

export const trackLyricOffsetSchema = trackRequestSchema.extend({
  offsetMs: z.number().int().min(-10_000).max(10_000)
});

export const trackFavoriteRequestSchema = trackRequestSchema.extend({ favorite: z.boolean() });
export const playlistRequestSchema = z.object({ playlistId: z.string().uuid() });
export const playlistNameRequestSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const renamePlaylistRequestSchema = playlistRequestSchema.extend(playlistNameRequestSchema.shape);
export const playlistTrackRequestSchema = playlistRequestSchema.extend(trackRequestSchema.shape);

export const libraryRootRequestSchema = z.object({
  rootId: z.string().uuid()
});

export const setLibraryRootWatchingSchema = libraryRootRequestSchema.extend({
  enabled: z.boolean()
});

export const playbackHistoryEventSchema = z.object({
  sessionId: z.string().uuid(),
  trackId: z.string().min(1).max(200),
  state: z.enum(["started", "completed"]),
  playedAt: z.number().int().nonnegative()
});

const providerCursorSchema = z.string().min(1).max(500);
const providerPageSizeSchema = z.number().int().min(1).max(100);

export const providerIdRequestSchema = z.object({
  providerId: providerIdSchema
}).strict();

export const providerPageRequestSchema = providerIdRequestSchema.extend({
  cursor: providerCursorSchema.optional(),
  pageSize: providerPageSizeSchema.optional()
}).strict();

export const providerSearchRequestSchema = providerPageRequestSchema.extend({
  query: z.string().trim().min(1).max(200)
}).strict();

export const providerPlaylistTracksRequestSchema = providerPageRequestSchema.extend({
  playlistId: z.string().min(1).max(300)
}).strict();

export const providerLyricsRequestSchema = providerIdRequestSchema.extend({
  trackId: z.string().min(1).max(300)
}).strict();

export const aggregatedSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(200),
  providers: z.array(providerIdSchema).min(1).max(3).optional(),
  pageSize: providerPageSizeSchema.optional()
}).strict().superRefine((request, context) => {
  if (request.providers && new Set(request.providers).size !== request.providers.length) {
    context.addIssue({ code: "custom", message: "DUPLICATE_PROVIDER" });
  }
});

export const providerPlaybackRequestSchema = providerIdRequestSchema.extend({
  trackId: z.string().min(1).max(300),
  providerTrackId: z.string().min(1).max(300),
  playbackSessionId: z.string().uuid(),
  fallbackReason: z.enum(["timeout", "temporary-network", "rate-limited", "circuit-open", "address-refresh-failed"]).optional(),
  fromProviderId: providerIdSchema.optional()
}).strict();

export const preferredProviderOrderRequestSchema = z.object({
  providerIds: z.array(providerIdSchema).length(3)
}).strict().superRefine((request, context) => {
  if (new Set(request.providerIds).size !== 3) {
    context.addIssue({ code: "custom", message: "INVALID_PROVIDER_ORDER" });
  }
});

export const providerConsentRequestSchema = z.object({
  version: z.literal(1),
  accepted: z.boolean()
}).strict();

export const radioStationListRequestSchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  query: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().min(1).max(500).optional(),
  pageSize: providerPageSizeSchema.optional()
}).strict();

export const radioStationRequestSchema = z.object({
  stationId: z.string().min(1).max(200)
}).strict();
export const externalUrlSchema = z.string().min(1).max(2_048);

export const updaterAuthStateSchema = z.object({
  authenticated: z.boolean()
}).strict();

export const updateActivityStateSchema = z.object({
  focusActive: z.boolean(),
  audioActive: z.boolean()
}).strict();
