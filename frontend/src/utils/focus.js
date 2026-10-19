export function clampFocusMinutes(value) {
  return Math.max(1, Math.min(180, Math.round(Number(value) || 1)));
}

export function formatCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

export function systemTimeKey(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 360 && minutes < 540) return "morning";
  if (minutes >= 540 && minutes < 690) return "forenoon";
  if (minutes >= 690 && minutes < 840) return "noon";
  if (minutes >= 840 && minutes < 1020) return "afternoon";
  if (minutes >= 1020 && minutes < 1140) return "dusk";
  if (minutes >= 1140 && minutes < 1380) return "night";
  return "midnight";
}
