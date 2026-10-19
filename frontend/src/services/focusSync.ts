import type { FocusRecordDraft } from "@studyroom/contracts";
import { http } from "./http";
import { listPendingLocalFocusRecords, saveLocalFocusRecord } from "./focusLocal";
import {useAuthStore} from '../stores/auth';
import {flushActivity} from '../activity/runtime';

interface FocusSyncResult {
  clientRecordId: string;
  status: "accepted" | "duplicate" | "rejected";
  cloudRecordId?: string | number;
  message?: string;
}

const syncInFlight = new Map<string, Promise<FocusSyncResult[]>>();

export function syncPendingFocusRecords(accountScope: string,automaticOnly=false): Promise<FocusSyncResult[]> {
  const key=`${accountScope}:${automaticOnly}`;
  const existing = syncInFlight.get(key);
  if (existing) return existing;
  const task = performFocusSync(accountScope,automaticOnly).finally(() => syncInFlight.delete(key));
  syncInFlight.set(key, task);
  return task;
}

async function performFocusSync(accountScope: string,automaticOnly:boolean): Promise<FocusSyncResult[]> {
  const auth=useAuthStore(),generation=auth.sessionGeneration;
  const guard=()=>{if(String(auth.user?.id)!==accountScope || auth.sessionGeneration!==generation || auth.authTransition)throw new DOMException('账号会话已结束','AbortError');};
  guard();
  const pending = (await listPendingLocalFocusRecords())
    .filter((record) => record.accountScope === accountScope && record.status === "completed" && (!automaticOnly||record.syncPolicy==='automatic'))
    .slice(0, 100);
  if (!pending.length) return [];
  await flushActivity();guard();

  try {
    const response = await http.post("/focus/sync", {
      records: pending.map((record) => ({
        clientRecordId: record.clientRecordId,
        activitySessionId: record.activitySessionId,
        sceneCode: record.sceneCode ?? "mountain",
        timeKey: record.timeKey ?? "morning",
        plannedMinutes: record.plannedMinutes,
        actualSeconds: record.completedSeconds ?? record.completedMinutes * 60,
        startedAt: new Date(record.startedAt).toISOString(),
        endedAt: new Date(record.finishedAt ?? record.startedAt).toISOString()
      }))
    },{mediaGuard:guard});
    guard();
    const results = (response?.data?.data?.results ?? []) as FocusSyncResult[];
    const byId = new Map(results.map((result) => [result.clientRecordId, result]));
    await Promise.all(pending.map(async (record) => {
      const result = byId.get(record.clientRecordId);
      await saveLocalFocusRecord({
        ...record,
        syncStatus: result?.status === "accepted" || result?.status === "duplicate" ? "synced" : "failed",
        cloudRecordId: result?.cloudRecordId,
        syncError: result?.status === "rejected" ? result.message || "SYNC_REJECTED" : undefined
      });
    }));
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : "SYNC_NETWORK_FAILED";
    await Promise.all(pending.map((record) => saveLocalFocusRecord({ ...record, syncStatus: "failed", syncError: message })));
    throw error;
  }
}
