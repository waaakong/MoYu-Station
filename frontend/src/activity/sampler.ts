import type {ActivitySegment,ActivityKind} from '@studyroom/contracts';
/** Only observed, continuous wall/monotonic time counts. State changes close the previous state. */
export class ActivitySampler {
  private last?:{wall:number;mono:number;state:ActivityKind};
  private blockedUntil=0;
  partial=false;
  sample(wall:number,mono:number,input:boolean|ActivityKind):ActivitySegment|undefined {
    const state=typeof input==='boolean'?(input?'FOCUS':'IDLE'):input;
    if(wall<=this.blockedUntil)return;
    const last=this.last;this.last={wall,mono,state};if(!last)return;
    const delta=wall-last.wall,elapsed=mono-last.mono;
    // A timer and a focus transition can legitimately run in the same millisecond.
    // Update the next state without inventing an interval or a missing-data marker.
    if(delta===0 && elapsed>=0 && elapsed<=1000){this.last={...last,state};return;}
    if(delta<=0){this.partial=true;this.blockedUntil=last.wall;this.last=undefined;return;}
    if(delta>5000||elapsed<0||elapsed>5000||Math.abs(delta-elapsed)>1000){this.partial=true;return;}
    return {startMs:last.wall,endMs:wall,state:last.state};
  }
  suspend(){this.last=undefined;}
}
