import type { Track } from "@studyroom/contracts";

const MAX_TEMPORARY_AUDIO_BYTES = 1024 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav", "webm"]);
let activeObjectUrl = "";
let cleanupInstalled = false;

export function temporaryWebTrack(
  file: Pick<File, "name" | "size" | "type">,
  createObjectUrl: () => string = () => URL.createObjectURL(file as File),
  revokeObjectUrl: (url: string) => void = (url) => URL.revokeObjectURL(url)
): Track {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!(file.type.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension))) {
    throw new Error("WEB_AUDIO_FILE_TYPE_UNSUPPORTED");
  }
  if (file.size <= 0 || file.size > MAX_TEMPORARY_AUDIO_BYTES) {
    throw new Error("WEB_AUDIO_FILE_SIZE_INVALID");
  }
  const objectUrl = createObjectUrl();
  if (!objectUrl.startsWith("blob:")) {
    revokeObjectUrl(objectUrl);
    throw new Error("WEB_AUDIO_OBJECT_URL_INVALID");
  }
  if (activeObjectUrl) revokeObjectUrl(activeObjectUrl);
  activeObjectUrl = objectUrl;
  installCleanup();
  return {
    id: `web-file:${crypto.randomUUID()}`,
    title: file.name.replace(/\.[^.]+$/, "") || "临时音频",
    artist: "本机临时文件",
    album: "仅在本次页面会话中可用",
    source: { kind: "builtin", assetId: objectUrl }
  };
}

function installCleanup() {
  if (cleanupInstalled || typeof window === "undefined") return;
  cleanupInstalled = true;
  window.addEventListener("pagehide", () => {
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = "";
  }, { once: true });
}
