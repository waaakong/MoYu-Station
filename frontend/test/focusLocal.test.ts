import { beforeEach, describe, expect, it } from "vitest";
import { listPendingLocalFocusRecords, saveLocalFocusRecord } from "../src/services/focusLocal";

describe("focus local sync policy", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
      }
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
    localStorage.clear();
    delete window.studyRoomDesktop;
  });

  it("never includes pre-login manual history in automatic sync", async () => {
    await saveLocalFocusRecord({
      clientRecordId: "00000000-0000-4000-8000-000000000001",
      startedAt: 100,
      plannedMinutes: 25,
      completedMinutes: 25,
      status: "completed",
      syncStatus: "local",
      syncPolicy: "manual-only"
    });
    await saveLocalFocusRecord({
      clientRecordId: "00000000-0000-4000-8000-000000000002",
      startedAt: 200,
      plannedMinutes: 25,
      completedMinutes: 25,
      status: "completed",
      syncStatus: "pending",
      syncPolicy: "automatic",
      accountScope: "7"
    });
    expect((await listPendingLocalFocusRecords()).map((record) => record.clientRecordId))
      .toEqual(["00000000-0000-4000-8000-000000000002"]);
  });
});
