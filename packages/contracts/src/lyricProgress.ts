export interface LyricFillWord {text:string;timeMs:number;endMs?:number}
export interface LyricFillLine {text:string;timeMs:number;words?:LyricFillWord[]}
export type LyricTimingMode='word'|'estimated'|'static';
const valid=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=86400000;
/** Shared stage/desktop timing model. No playback clock or inferred song length. */
export function lyricFill(line:LyricFillLine|undefined,nextStart?:number,durationMs?:number):{mode:LyricTimingMode;words?:LyricFillWord[]} {
  if(!line?.text||!valid(line.timeMs))return {mode:'static'};
  const end=valid(nextStart)&&nextStart>line.timeMs?nextStart:valid(durationMs)&&durationMs>line.timeMs?durationMs:undefined;
  const words=line.words;
  if(words?.length&&words.length<=500&&words.map(w=>w.text).join('')===line.text&&words.every((w,i)=>!!w.text&&valid(w.timeMs)&&w.timeMs>=line.timeMs&&(i===0||w.timeMs>=words[i-1]!.timeMs))){
    const resolved=words.map((w,i)=>{const boundary=words[i+1]?.timeMs??end;const finish=valid(w.endMs)&&w.endMs>w.timeMs?w.endMs:valid(boundary)&&boundary>w.timeMs?boundary:undefined;return {text:w.text,timeMs:w.timeMs,...(finish!==undefined?{endMs:finish}:{})};});
    if(resolved.every(w=>w.endMs!==undefined))return {mode:'word',words:resolved};
    return {mode:'static'};
  }
  if(end===undefined)return {mode:'static'};
  const chars=Array.from(line.text),chunk=Math.ceil(chars.length/500),estimated:LyricFillWord[]=[];
  for(let i=0;i<chars.length;i+=chunk)estimated.push({text:chars.slice(i,i+chunk).join(''),timeMs:line.timeMs+(end-line.timeMs)*i/chars.length,endMs:line.timeMs+(end-line.timeMs)*Math.min(chars.length,i+chunk)/chars.length});
  return {mode:'estimated',words:estimated};
}
export function lyricWordProgress(word:LyricFillWord,positionMs:number):number {
  if(!valid(positionMs))return 0;
  if(!valid(word.endMs)||word.endMs<=word.timeMs)return Number(positionMs>=word.timeMs);
  return Math.min(1,Math.max(0,(positionMs-word.timeMs)/(word.endMs-word.timeMs)));
}
