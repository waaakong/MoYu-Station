export type FocusTimerState = "running" | "paused";

export interface FocusTimerSession {
  activitySessionId?: string;
  version: 2;
  clientRecordId: string;
  plannedMinutes: number;
  startedAt: number;
  elapsedBeforeSegmentMs: number;
  segmentStartedAt?: number;
  targetEndAt?: number;
  state: FocusTimerState;
  sceneCode: string;
  timeKey: string;
  syncPolicy: "automatic" | "manual-only";
  accountScope?: string;
  /** Last continuously observed instant; never infer elapsed time after a restart. */
  observedAt?: number;
}

export interface FocusTimerSnapshot {
  elapsedSeconds: number;
  remainingSeconds: number;
  complete: boolean;
}

const MINUTE_MS = 60_000;

export function createFocusTimerSession(input: {
  activitySessionId?: string;
  clientRecordId: string;
  plannedMinutes: number;
  sceneCode: string;
  timeKey: string;
  accountScope?: string;
}, now = Date.now()): FocusTimerSession {
  const plannedMinutes = Math.max(1, Math.min(180, Math.round(input.plannedMinutes)));
  return {
    version: 2,
    clientRecordId: input.clientRecordId,
    activitySessionId: input.activitySessionId,
    plannedMinutes,
    startedAt: now,
    elapsedBeforeSegmentMs: 0,
    segmentStartedAt: now,
    observedAt: now,
    targetEndAt: now + plannedMinutes * MINUTE_MS,
    state: "running",
    sceneCode: input.sceneCode,
    timeKey: input.timeKey,
    syncPolicy: input.accountScope ? "automatic" : "manual-only",
    accountScope: input.accountScope
  };
}

export function focusTimerSnapshot(session: FocusTimerSession, now = Date.now()): FocusTimerSnapshot {
  const plannedMs = session.plannedMinutes * MINUTE_MS;
  const elapsedMs = session.state === "running" && session.targetEndAt != null
    ? plannedMs - Math.max(0, session.targetEndAt - now)
    : session.elapsedBeforeSegmentMs;
  const boundedElapsedMs = Math.min(plannedMs, Math.max(0, elapsedMs));
  return {
    elapsedSeconds: Math.floor(boundedElapsedMs / 1000),
    remainingSeconds: Math.max(0, Math.ceil((plannedMs - boundedElapsedMs) / 1000)),
    complete: boundedElapsedMs >= plannedMs
  };
}

export function pauseFocusTimer(session: FocusTimerSession, now = Date.now()): FocusTimerSession {
  if (session.state !== "running") return session;
  const plannedMs = session.plannedMinutes * MINUTE_MS;
  const elapsedMs = session.targetEndAt == null
    ? session.elapsedBeforeSegmentMs
    : plannedMs - Math.max(0, session.targetEndAt - now);
  return {
    ...session,
    state: "paused",
    elapsedBeforeSegmentMs: Math.min(plannedMs, Math.max(0, elapsedMs)),
    segmentStartedAt: undefined,
    targetEndAt: undefined
  };
}

export function resumeFocusTimer(session: FocusTimerSession, now = Date.now()): FocusTimerSession {
  if (session.state !== "paused") return session;
  const plannedMs = session.plannedMinutes * MINUTE_MS;
  const remainingMs = Math.max(0, plannedMs - session.elapsedBeforeSegmentMs);
  return {
    ...session,
    state: "running",
    segmentStartedAt: now,
    observedAt: now,
    targetEndAt: now + remainingMs
  };
}

export function sanitizeFocusTimerSession(value: unknown): FocusTimerSession | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<FocusTimerSession>;
  if (candidate.version !== 2 || typeof candidate.clientRecordId !== "string") return undefined;
  if (!Number.isFinite(candidate.plannedMinutes) || Number(candidate.plannedMinutes) < 1 || Number(candidate.plannedMinutes) > 180) return undefined;
  if (!Number.isFinite(candidate.startedAt) || !Number.isFinite(candidate.elapsedBeforeSegmentMs)) return undefined;
  if (candidate.state !== "running" && candidate.state !== "paused") return undefined;
  if (candidate.syncPolicy !== "automatic" && candidate.syncPolicy !== "manual-only") return undefined;
  if (candidate.state === "running" && (!Number.isFinite(candidate.segmentStartedAt) || !Number.isFinite(candidate.targetEndAt))) return undefined;
  if (candidate.observedAt !== undefined && (!Number.isFinite(candidate.observedAt) || candidate.observedAt < Number(candidate.startedAt))) return undefined;
  return candidate as FocusTimerSession;
}
