export interface PlaybackObservation {
  positionMs:number;
  playing:boolean;
  rate:number;
  observedAt:number;
}
/** Visual interpolation only; never writes the audio player's position. */
export class StageClock {
  private anchor:PlaybackObservation={positionMs:0,playing:false,rate:1,observedAt:0};
  observe(value:PlaybackObservation):void {
    this.anchor={
      positionMs:Number.isFinite(value.positionMs)?Math.max(0,value.positionMs):0,
      playing:value.playing&&Number.isFinite(value.observedAt),
      rate:Number.isFinite(value.rate)&&value.rate>0?Math.min(4,value.rate):1,
      observedAt:Number.isFinite(value.observedAt)?value.observedAt:0
    };
  }
  query(now:number):number {
    const a=this.anchor;
    const elapsed=a.playing&&Number.isFinite(now)?Math.min(1000,Math.max(0,now-a.observedAt)):0;
    return a.positionMs+elapsed*a.rate;
  }
  reset():void {this.anchor={positionMs:0,playing:false,rate:1,observedAt:0};}
}
