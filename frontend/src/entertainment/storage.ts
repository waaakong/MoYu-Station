import { ENTERTAINMENT_STATE_IDS,CLASSIC_GAME_IDS, type EntertainmentState, type EntertainmentStateId } from "@studyroom/contracts";
import { sanitizeEntertainmentState } from "./runtime";

const WEB_KEY_PREFIX = "studyroom-entertainment-v1:";

export async function readEntertainmentState(toolId: EntertainmentStateId): Promise<EntertainmentState> {
  if (window.studyRoomDesktop) {
    const record = await window.studyRoomDesktop.readEntertainmentState({ toolId });
    return sanitizeEntertainmentState(toolId, record?.state);
  }
  try {
    return sanitizeEntertainmentState(toolId, JSON.parse(localStorage.getItem(`${WEB_KEY_PREFIX}${toolId}`) || "null"));
  } catch {
    return sanitizeEntertainmentState(toolId, undefined);
  }
}

export async function saveEntertainmentState(toolId: EntertainmentStateId, state: EntertainmentState): Promise<void> {
  const safe = sanitizeEntertainmentState(toolId, state);
  if (window.studyRoomDesktop) {
    await window.studyRoomDesktop.saveEntertainmentState({ toolId, state: safe });
    return;
  }
  localStorage.setItem(`${WEB_KEY_PREFIX}${toolId}`, JSON.stringify(safe));
}

export async function readAllEntertainmentState(): Promise<EntertainmentState[]> {
  return Promise.all(ENTERTAINMENT_STATE_IDS.filter(id=>!(CLASSIC_GAME_IDS as readonly string[]).includes(id)).map(readEntertainmentState));
}
