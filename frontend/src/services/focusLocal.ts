import type { FocusRecordDraft, FocusRecordListRequest, FocusWorkspace } from "@studyroom/contracts";

const RECORDS_KEY = "studyroom-focus-records-v2";
const WORKSPACE_PREFIX = "studyroom-focus-workspace-v1:";
const MAX_RECORDS = 10_000;

function readWebRecords(): FocusRecordDraft[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function saveLocalFocusRecord(record: FocusRecordDraft): Promise<void> {
  if (window.studyRoomDesktop) {
    await window.studyRoomDesktop.saveFocusRecord(record);
    return;
  }
  const records = readWebRecords();
  const index = records.findIndex((item) => item.clientRecordId === record.clientRecordId);
  if (index >= 0) records[index] = record;
  else records.unshift(record);
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
}

export async function listLocalFocusRecords(request: FocusRecordListRequest = {}): Promise<FocusRecordDraft[]> {
  if (window.studyRoomDesktop) return window.studyRoomDesktop.listFocusRecords(request);
  const records = readWebRecords()
    .filter((record) => !request.syncPolicy || record.syncPolicy === request.syncPolicy)
    .sort((a, b) => b.startedAt - a.startedAt);
  return records.slice(0, request.limit ?? 500);
}

export async function listPendingLocalFocusRecords(): Promise<FocusRecordDraft[]> {
  if (window.studyRoomDesktop) return window.studyRoomDesktop.listPendingFocusRecords();
  return readWebRecords()
    .filter((record) => record.syncPolicy === "automatic" && (record.syncStatus === "pending" || record.syncStatus === "failed"))
    .sort((a, b) => a.startedAt - b.startedAt);
}

export async function readFocusWorkspace(accountScope: string): Promise<FocusWorkspace | undefined> {
  if (window.studyRoomDesktop) return window.studyRoomDesktop.readFocusWorkspace({ accountScope });
  try {
    return JSON.parse(localStorage.getItem(`${WORKSPACE_PREFIX}${accountScope}`) || "null") || undefined;
  } catch {
    return undefined;
  }
}

export async function saveFocusWorkspace(workspace: FocusWorkspace): Promise<void> {
  if (window.studyRoomDesktop) {
    await window.studyRoomDesktop.saveFocusWorkspace(workspace);
    return;
  }
  localStorage.setItem(`${WORKSPACE_PREFIX}${workspace.accountScope}`, JSON.stringify(workspace));
}
