import type { LocalProfileSummary } from "@studyroom/contracts";

const desktopRequired = Object.freeze({ status: "desktop-required" as const });

export async function readLocalProfileSummary(): Promise<LocalProfileSummary> {
  if (typeof window === "undefined" || !window.studyRoomDesktop) return desktopRequired;
  return window.studyRoomDesktop.readLocalProfileSummary();
}
