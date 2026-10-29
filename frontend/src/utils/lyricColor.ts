export const LYRIC_COLOR_PRESETS=[
  ['苔绿','#d8e6ad'],['月白','#f3f1e5'],['雾蓝','#accfe3'],['暖杏','#edc7a5'],['淡紫','#d6bddf'],
  ['玫瑰','#e8aeb9'],['薄荷','#9ed9c4'],['海盐','#81b9d4'],['琥珀','#e5c16e'],['银灰','#aab7a3']
] as const;
export function normalizeLyricColor(input:string):string|null {
  const value=input.trim().replace(/^#?/,'#');
  return /^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
}
export type Hsv=[number,number,number];
export function hexToHsv(hex:string):Hsv {
  const valid=normalizeLyricColor(hex)||'#000000';
  const c=[1,3,5].map(i=>parseInt(valid.slice(i,i+2),16)/255),mx=Math.max(...c),mn=Math.min(...c),d=mx-mn;
  const h=!d?0:mx===c[0]?((c[1]!-c[2]!)/d)%6:mx===c[1]?(c[2]!-c[0]!)/d+2:(c[0]!-c[1]!)/d+4;
  return[(h*60+360)%360,mx?d/mx:0,mx];
}
export function hsvToHex([h,s,v]:Hsv):string {
  h=Number.isFinite(h)?((h%360)+360)%360:0;s=Number.isFinite(s)?Math.min(1,Math.max(0,s)):0;v=Number.isFinite(v)?Math.min(1,Math.max(0,v)):0;
  const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');
}
