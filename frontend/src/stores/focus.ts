import { defineStore } from "pinia";
import type { FocusRecordDraft } from "@studyroom/contracts";
import {
  createFocusTimerSession,
  focusTimerSnapshot,
  pauseFocusTimer,
  resumeFocusTimer,
  sanitizeFocusTimerSession,
  type FocusTimerSession
} from "../focus/timer";
import { saveLocalFocusRecord } from "../services/focusLocal";
import {activityState} from '../activity/state';

const SESSION_KEY = "studyroom-focus-session-v2";
const LEGACY_SESSION_KEY = "studyroom-focus-session";

function newRecordId(): string {
  return crypto.randomUUID();
}

function migrateLegacySession(value: unknown, now: number): FocusTimerSession | undefined {
  if (!value || typeof value !== "object") return undefined;
  const legacy = value as Record<string, unknown>;
  const plannedMinutes = Math.max(1, Math.min(180, Number(legacy.selectedMinutes) || 25));
  const savedAt = Number(legacy.savedAt) || now;
  const state = legacy.timerState === "paused" ? "paused" : "running";
  const elapsedSeconds = Math.max(0, Number(legacy.elapsedSeconds) || 0);
  const remainingSeconds = Math.max(0, Number(legacy.remainingSeconds) || plannedMinutes * 60);
  return {
    version: 2,
    clientRecordId: newRecordId(),
    plannedMinutes,
    startedAt: savedAt - elapsedSeconds * 1000,
    elapsedBeforeSegmentMs: elapsedSeconds * 1000,
    segmentStartedAt: state === "running" ? savedAt : undefined,
    targetEndAt: state === "running" ? savedAt + remainingSeconds * 1000 : undefined,
    state,
    sceneCode: String(legacy.sceneCode || "mountain"),
    timeKey: String(legacy.timeKey || "morning"),
    syncPolicy: "manual-only"
  };
}

export const useFocusStore = defineStore("focus", {
  state: () => ({
    session: null as FocusTimerSession | null,
    nowMs: Date.now(),
    completedRecord: null as FocusRecordDraft | null,
    spaceAllowed: true,
    persistenceError: ""
    ,operationPending: false
  }),
  getters: {
    snapshot(state) {
      return state.session
        ? focusTimerSnapshot(state.session, state.nowMs)
        : { elapsedSeconds: 0, remainingSeconds: 0, complete: false };
    },
    timerState(state): "idle" | "running" | "paused" | "completed" {
      if (state.session) return state.session.state;
      return state.completedRecord ? "completed" : "idle";
    },
    activeRecordId(state): string | undefined {
      return state.session?.clientRecordId;
    }
  },
  actions: {
    setSpaceAllowed(allowed: boolean) {
      this.spaceAllowed = allowed;
      if (!allowed && this.timerState === 'running') this.pause();
    },
    persistSession() {
      if (typeof localStorage === "undefined") return;
      if (this.session) localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
      else localStorage.removeItem(SESSION_KEY);
    },
    async persistRecord(record: FocusRecordDraft) {
      try {
        await saveLocalFocusRecord(record);
        this.persistenceError = "";
      } catch (error) {
        this.persistenceError = error instanceof Error ? error.message : "LOCAL_SAVE_FAILED";
        throw error;
      }
    },
    hydrate(now = Date.now()) {
      this.nowMs = now;
      try {
        this.session = sanitizeFocusTimerSession(JSON.parse(localStorage.getItem(SESSION_KEY) || "null")) ?? null;
        if (!this.session) {
          this.session = migrateLegacySession(JSON.parse(localStorage.getItem(LEGACY_SESSION_KEY) || "null"), now) ?? null;
          if (this.session) this.persistSession();
        }
      } catch {
        this.session = null;
      }
      // A saved running session is a checkpoint, not proof the app ran while closed.
      if (this.session?.state === 'running') {
        const checkpoint = Math.min(now, Math.max(this.session.segmentStartedAt!, this.session.observedAt ?? this.session.segmentStartedAt!));
        this.session = pauseFocusTimer(this.session, checkpoint);
        this.persistSession();
      }
      if (!this.session) localStorage.removeItem(SESSION_KEY);
      if (!this.spaceAllowed && this.session?.state === 'running') this.pause(now);
      return this.session;
    },
    async start(input: { plannedMinutes: number; sceneCode: string; timeKey: string; accountScope?: string }, now = Date.now()) {
      if (!this.spaceAllowed) throw new Error('请返回空间后开始专注。');
      if(this.session || this.operationPending)throw new Error('已有专注会话，请继续或结束当前会话。');
      const session = createFocusTimerSession({ ...input, clientRecordId: newRecordId(),activitySessionId:activityState.enabled&&activityState.owner===input.accountScope?activityState.sessionId:undefined }, now);
      this.session = session;
      this.completedRecord = null;
      this.nowMs = now;
      this.persistSession();
      this.operationPending=true;
      try {
        await this.persistRecord({
          clientRecordId: session.clientRecordId,
          activitySessionId: session.activitySessionId,
          startedAt: session.startedAt,
          plannedMinutes: session.plannedMinutes,
          completedMinutes: 0,
          completedSeconds: 0,
          sceneCode: session.sceneCode,
          timeKey: session.timeKey,
          status: "active",
          syncStatus: "local",
          syncPolicy: session.syncPolicy,
          accountScope: session.accountScope
        });
      } catch (error) {
        this.session = null;
        this.persistSession();
        throw error;
      } finally {this.operationPending=false;}
      return session;
    },
    pause(now = Date.now()) {
      if (!this.session) return;
      const last = this.session.observedAt ?? this.session.segmentStartedAt ?? now;
      const confirmed = now < last || now - last > 5000 ? last : now;
      this.session = pauseFocusTimer(this.session, confirmed);
      this.nowMs = now;
      this.persistSession();
    },
    resume(now = Date.now()) {
      if (!this.spaceAllowed) return;
      if (!this.session) return;
      this.session = resumeFocusTimer(this.session, now);
      this.nowMs = now;
      this.persistSession();
    },
    refresh(now = Date.now()) {
      this.nowMs = now;
      if (this.session?.state === 'running') {
        const last = this.session.observedAt ?? this.session.segmentStartedAt!;
        if (now < last || now-last>5000) this.session=pauseFocusTimer(this.session,last);
        else this.session.observedAt = now;
        this.persistSession();
      }
      return Boolean(this.session && focusTimerSnapshot(this.session, now).complete);
    },
    async complete(now = Date.now()) {
      if(this.operationPending)throw new Error('专注记录正在保存。');
      if (!this.session) return this.completedRecord;
      this.refresh(now);
      const session = this.session;
      const snapshot = focusTimerSnapshot(session, now);
      const record: FocusRecordDraft = {
        clientRecordId: session.clientRecordId,
        activitySessionId: session.activitySessionId,
        startedAt: session.startedAt,
        finishedAt: now,
        plannedMinutes: session.plannedMinutes,
        completedMinutes: Math.max(1, Math.ceil(snapshot.elapsedSeconds / 60)),
        completedSeconds: snapshot.elapsedSeconds,
        sceneCode: session.sceneCode,
        timeKey: session.timeKey,
        status: "completed",
        syncStatus: session.syncPolicy === "automatic" ? "pending" : "local",
        syncPolicy: session.syncPolicy,
        accountScope: session.accountScope
      };
      this.operationPending=true;
      try{await this.persistRecord(record);this.session=null;this.completedRecord=record;this.persistSession();return record;}
      finally{this.operationPending=false;}
    },
    async cancel(now = Date.now()) {
      if(this.operationPending)throw new Error('专注记录正在保存。');
      if (!this.session) return;
      this.refresh(now);
      const session = this.session;
      const snapshot = focusTimerSnapshot(session, now);
      this.operationPending=true;
      try{await this.persistRecord({
        clientRecordId: session.clientRecordId,
        activitySessionId: session.activitySessionId,
        startedAt: session.startedAt,
        finishedAt: now,
        plannedMinutes: session.plannedMinutes,
        completedMinutes: Math.ceil(snapshot.elapsedSeconds / 60),
        completedSeconds: snapshot.elapsedSeconds,
        sceneCode: session.sceneCode,
        timeKey: session.timeKey,
        status: "canceled",
        syncStatus: "local",
        syncPolicy: session.syncPolicy,
        accountScope: session.accountScope
      });
      this.session = null;
      this.completedRecord = null;
      this.nowMs = now;
      this.persistSession();
      }finally{this.operationPending=false;}
    },
    resetCompleted() {
      this.completedRecord = null;
    }
  }
});
