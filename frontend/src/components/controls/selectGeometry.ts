export function placeSelect(anchor: {left:number;top:number;bottom:number;width:number}, viewport: {width:number;height:number;left?:number;top?:number}, desiredHeight:number) {
  const x=viewport.left??0,y=viewport.top??0,margin=8,gap=6;
  const width=Math.min(Math.max(anchor.width,176),Math.max(0,viewport.width-margin*2));
  const below=Math.max(0,y+viewport.height-anchor.bottom-gap-margin),above=Math.max(0,anchor.top-y-gap-margin);
  const up=below<Math.min(desiredHeight,240)&&above>below;
  const height=Math.min(desiredHeight,320,up?above:below);
  return {left:Math.max(x+margin,Math.min(anchor.left,x+viewport.width-width-margin)),top:up?anchor.top-gap-height:anchor.bottom+gap,width,maxHeight:height,up};
}
