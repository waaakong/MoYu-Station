import type {ActivitySegment} from '@studyroom/contracts';
export function shanghaiDate(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function projectActivity(segments:ActivitySegment[],date:string,now=Date.now()){
  const from=Date.parse(`${date}T00:00:00+08:00`),until=Math.min(from+86400000,now);
  const events=new Map<number,number[]>();let hasLegacy=false;
  for(const s of segments){
    const a=Math.max(from,s.startMs),b=Math.min(until,s.endMs);if(a>=b)continue;
    const focus=s.state==='FOCUS'||s.state==='FOCUS_V3',relax=s.state==='RELAX';
    hasLegacy ||= s.state==='FOCUS'||s.state==='IDLE';
    for(const [time,sign] of [[a,1],[b,-1]] as const){const e=events.get(time)||[0,0,0];e[0]!+=sign;e[1]!+=focus?sign:0;e[2]!+=relax?sign:0;events.set(time,e);}
  }
  let onlineMs=0,focusMs=0,fishMs=0,active=0,focusing=0,relaxing=0,previous=from;
  for(const [time,e] of [...events].sort((a,b)=>a[0]-b[0])){
    const d=time-previous;if(active>0)onlineMs+=d;if(focusing>0)focusMs+=d;else if(relaxing>0)fishMs+=d;
    active+=e[0]!;focusing+=e[1]!;relaxing+=e[2]!;previous=time;
  }
  return {onlineMs,focusMs,fishMs,hasLegacy,index:onlineMs>0?(focusMs+fishMs*2)/onlineMs:null};
}
