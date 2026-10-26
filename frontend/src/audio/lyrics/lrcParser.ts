export interface LyricLine {
  timeMs: number;
  text: string;
  words?: {text:string;timeMs:number;endMs?:number}[];
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
  for (const rawLine of content.slice(0,512*1024).replace(/^\uFEFF/, "").split(/\r?\n/).slice(0,10000)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const metadataMatch = trimmed.match(metadataPattern);
    if (metadataMatch && !/^\d+$/.test(metadataMatch[1])) {
      metadata[metadataMatch[1].toLowerCase()] = metadataMatch[2].trim();
      continue;
    }
    const timestamps = [...trimmed.matchAll(timestampPattern)];
    if (!timestamps.length) continue;
    const rawText = trimmed.replace(timestampPattern, "").trim();
    const markers=[...rawText.matchAll(/<(\d{1,4}):(\d{1,2})(?:[.:](\d{1,3}))?>/g)];
    const words:{text:string;timeMs:number;endMs?:number}[]=[];
    for(let i=0;i<markers.length&&i<500;i++){
      const m=markers[i]!,fraction=m[3]||'0',timeMs=(Number(m[1])*60+Number(m[2]))*1000+Number(fraction.padEnd(3,'0'));
      if(Number(m[2])>=60||timeMs<0||timeMs>86400000)continue;
      const value=rawText.slice(m.index!+m[0].length,markers[i+1]?.index);
      if(value)words.push({text:value,timeMs});
    }
    const validWords=words.length&&words.every((w,i)=>i===0||w.timeMs>=words[i-1]!.timeMs)?words:undefined;
    if(validWords)for(let i=0;i<validWords.length-1;i++)validWords[i]!.endMs=validWords[i+1]!.timeMs;
    const text = rawText.replace(/<\d{1,4}:\d{1,2}(?:[.:]\d{1,3})?>/g,'').slice(0,2000);
    for (const match of timestamps) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) continue;
      const fraction = match[3] ?? "0";
      const milliseconds = fraction.length === 1 ? Number(fraction) * 100 : fraction.length === 2 ? Number(fraction) * 10 : Number(fraction);
      lines.push({ timeMs: (minutes * 60 + seconds) * 1000 + milliseconds, text,...(validWords&&timestamps.length===1&&validWords.map(w=>w.text).join('')===text?{words:validWords}:{}) });
    }
  }
  lines.sort((left, right) => left.timeMs - right.timeMs);
  return { lines, metadata };
}
