import {z} from 'zod';
import {DESKTOP_WHEEL_COMMANDS} from '@studyroom/contracts';
export const wheelSettingsSchema=z.object({enabled:z.boolean(),accelerator:z.string().regex(/^Control\+Alt(?:\+(Shift\+)?(Space|[A-Z0-9]|F([1-9]|1[0-2])))?$/),slots:z.array(z.enum(DESKTOP_WHEEL_COMMANDS)).length(8).refine(v=>new Set(v).size===8),allowFullscreen:z.boolean()}).strict();
export const DEFAULT_WHEEL={enabled:true,accelerator:'Control+Alt',slots:[...DESKTOP_WHEEL_COMMANDS],allowFullscreen:false};
export function nativeArguments(accelerator:string,allowFullscreen:boolean){
  const value=wheelSettingsSchema.shape.accelerator.parse(accelerator),parts=value.split('+'),key=parts[parts.length-1]!;
  if(value==='Control+Alt')return['0','3',allowFullscreen?'1':'0'];
  const vk=key==='Space'?32:key.startsWith('F')&&key.length>1?111+Number(key.slice(1)):key.charCodeAt(0);
  return[String(vk),value.includes('Shift+')?'7':'3',allowFullscreen?'1':'0'];
}
export function parseWheelMessage(line:string){
  const match=/^(OPEN|MOVE|RELEASE|CANCEL) ([1-9]\d{0,8}) (-?\d{1,7}) (-?\d{1,7})$/.exec(line);
  return match?{type:match[1]!,sequence:Number(match[2]),x:Number(match[3]),y:Number(match[4])}:undefined;
}
export function parseWheelFocusTrace(line:string){
  const match=/^(TRANSFER|FOREGROUND|GESTURE|ACTIVATION) ([1-9]\d{0,8}) ([01]) (\d{1,10})$/.exec(line);
  if(!match)return;
  const detail=Number(match[4]);if(detail>0xffffffff||['FOREGROUND','GESTURE'].includes(match[1]!)&&detail>1)return;
  return {kind:match[1]!,sequence:Number(match[2]),flag:match[3]==='1',detail};
}
export function nativeWindowArgument(handle:Buffer){
  if(handle.length!==4&&handle.length!==8)throw new Error('WHEEL_MAIN_WINDOW_HANDLE_INVALID');
  const value=handle.length===8?handle.readBigUInt64LE():BigInt(handle.readUInt32LE());
  if(value===0n)throw new Error('WHEEL_MAIN_WINDOW_HANDLE_INVALID');
  return value.toString(10);
}
export function wheelSlot(dx:number,dy:number){if(Math.hypot(dx,dy)<66)return -1;return Math.round((Math.atan2(dy,dx)*180/Math.PI+90+360)%360/45)%8;}
