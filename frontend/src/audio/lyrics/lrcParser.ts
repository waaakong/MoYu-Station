export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface ParsedLyrics {
  lines: LyricLine[];
  metadata: Record<string, string>;
}

const timestampPattern = /\[(\d{1,4}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const metadataPattern = /^\[([a-zA-Z]{2,8}):([^\]]*)\]$/;

export function parseLrc(content: string): ParsedLyrics {
  const lines: LyricLine[] = [];
  const metadata: Record<string, string> = {};
  for (const rawLine of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const metadataMatch = trimmed.match(metadataPattern);
    if (metadataMatch && !/^\d+$/.test(metadataMatch[1])) {
      metadata[metadataMatch[1].toLowerCase()] = metadataMatch[2].trim();
      continue;
    }
    const timestamps = [...trimmed.matchAll(timestampPattern)];
    if (!timestamps.length) continue;
    const text = trimmed.replace(timestampPattern, "").trim();
    for (const match of timestamps) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) continue;
      const fraction = match[3] ?? "0";
      const milliseconds = fraction.length === 1 ? Number(fraction) * 100 : fraction.length === 2 ? Number(fraction) * 10 : Number(fraction);
      lines.push({ timeMs: (minutes * 60 + seconds) * 1000 + milliseconds, text });
    }
  }
  lines.sort((left, right) => left.timeMs - right.timeMs);
  return { lines, metadata };
}
