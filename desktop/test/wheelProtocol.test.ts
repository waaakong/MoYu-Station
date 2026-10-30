import {describe,it,expect} from 'vitest';
import {wheelSettingsSchema,DEFAULT_WHEEL,nativeArguments,parseWheelMessage,parseWheelFocusTrace,wheelSlot} from '../src/main/music/wheelProtocol';
describe('finite global wheel protocol',()=>{
  it('only permits fixed modifiers and known finite commands',()=>{
    expect(DEFAULT_WHEEL.accelerator).toBe('Control+Alt');
    expect(nativeArguments('Control+Alt',false)).toEqual(['0','3','0']);
    expect(nativeArguments('Control+Alt+Space',false)).toEqual(['32','3','0']);
    expect(nativeArguments('Control+Alt+Shift+F12',true)).toEqual(['123','7','1']);
    for(const accelerator of ['Alt','Space','Control+Alt+;calc.exe','Control+Alt+F13'])expect(()=>nativeArguments(accelerator,false)).toThrow();
    expect(wheelSettingsSchema.safeParse({...DEFAULT_WHEEL,slots:Array(8).fill('next')}).success).toBe(false);
    expect(wheelSettingsSchema.safeParse({...DEFAULT_WHEEL,slots:['shell',...DEFAULT_WHEEL.slots.slice(1)]}).success).toBe(false);
  });
  it('rejects malformed, oversized and unknown helper events',()=>{
    expect(parseWheelMessage('OPEN 1 -1920 100')).toEqual({type:'OPEN',sequence:1,x:-1920,y:100});
    for(const value of ['EXEC 1 0 0','RELEASE 0 0 0','RELEASE 1 NaN 0','MOVE 1 9999999999 0','OPEN 1 0 0 extra'])expect(parseWheelMessage(value)).toBeUndefined();
  });
  it('keeps the centre as cancellation and maps eight clockwise wedges',()=>{
    expect(wheelSlot(0,0)).toBe(-1);expect(wheelSlot(49,0)).toBe(-1);expect(wheelSlot(65,0)).toBe(-1);expect(wheelSlot(66,0)).toBe(2);
    for(let slot=0;slot<8;slot++){const angle=(slot*45-90)*Math.PI/180;expect(wheelSlot(Math.cos(angle)*100,Math.sin(angle)*100)).toBe(slot);}
  });
  it('keeps focus diagnostics finite and separate from executable commands',()=>{
    expect(parseWheelFocusTrace('TRANSFER 12 0 5')).toEqual({kind:'TRANSFER',sequence:12,flag:false,detail:5});
    expect(parseWheelFocusTrace('FOREGROUND 12 1 0')).toEqual({kind:'FOREGROUND',sequence:12,flag:true,detail:0});
    expect(parseWheelFocusTrace('GESTURE 12 0 1')).toEqual({kind:'GESTURE',sequence:12,flag:false,detail:1});
    expect(parseWheelMessage('TRANSFER 12 0 5')).toBeUndefined();
    for(const line of ['TRANSFER 0 1 0','TRANSFER 1 2 0','TRANSFER 1 0 4294967296','FOREGROUND 1 0 2','FOREGROUND 1 1 0 title','OPEN 1 0 0'])expect(parseWheelFocusTrace(line)).toBeUndefined();
  });
});
