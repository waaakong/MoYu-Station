import type {StageLyricStyle} from '@studyroom/contracts';
import type {LyricLine} from '../../../audio/lyrics/lrcParser';
export function lyricWindow(length:number,index:number,style:StageLyricStyle):number[] {
  const center=Math.max(0,index),radius=style==='giant'||style==='story'?0:style==='focus'?1:2;
  const from=Math.max(0,center-radius),to=Math.min(length,center+(radius||1)+1);
  return Array.from({length:Math.max(0,to-from)},(_,i)=>from+i);
}
export function storyVariant(identity:string,index:number):number {
  let hash=2166136261;for(const char of `${identity}:${index}`)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return (hash>>>0)%3;
}
export function wordProgress(word:NonNullable<LyricLine['words']>[number],position:number):number|undefined {
  if(word.endMs===undefined||word.endMs<=word.timeMs)return;
  return Math.min(1,Math.max(0,(position-word.timeMs)/(word.endMs-word.timeMs)));
}
