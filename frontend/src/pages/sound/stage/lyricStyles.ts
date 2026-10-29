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

/** Geometry from approved v17; all values depend only on current row and viewport. */
export function lyricRowPose(style:StageLyricStyle,index:number,current:number,height:number,mobile:boolean){
 const d=index-Math.max(0,current),short=height<230;let spacing=short?59:82,x=0,scale=d===0?1:.92,opacity=d===0?1:Math.abs(d)===1?.35:.13;
 if(style==='focus'){spacing=short?80:125;opacity=d===0?1:d===1?.23:0;scale=d===0?1.05:.83;}
 if(style==='steps'){spacing=short?62:84;x=Math.max(-2,Math.min(2,d))*(mobile?18:30)+22;opacity=Math.abs(d)<3?(d===0?1:.28):0;}
 if(style==='giant'){spacing=short?130:190;opacity=d===0?1:.1;scale=d===0?1:.86;}
 if(style==='chat'){spacing=short?68:105;x=index%2?(mobile?24:36):0;opacity=d===0?1:d===-1?.34:d===1?.18:0;scale=d===0?1:.94;}
 if(Math.abs(d)>3)opacity=0;
 return {x,y:d*spacing,scale,opacity,spacing};
}
