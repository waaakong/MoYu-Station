/** A renderer-wide budget, shared by chat messages, panels and previews. */
export class GifPlaybackBudget {
  private entries = new Map<symbol, { visible: boolean; change: (playing: boolean) => void; playing: boolean }>();
  private allowed = true;
  register(change: (playing: boolean) => void) {
    const id=Symbol();this.entries.set(id,{visible:false,change,playing:false});
    return { visible:(value:boolean)=>{const entry=this.entries.get(id);if(entry){entry.visible=value;this.update();}},dispose:()=>{const entry=this.entries.get(id);this.entries.delete(id);if(entry?.playing)entry.change(false);this.update();} };
  }
  allow(value:boolean){this.allowed=value;this.update();}
  private update(){let slots=this.allowed?2:0;for(const entry of this.entries.values()){const play=entry.visible && slots>0;if(play)slots--;if(entry.playing!==play){entry.playing=play;entry.change(play);}}}
}
export const gifPlayback = new GifPlaybackBudget();
