import {describe,it,expect} from 'vitest';
import {wheelSettingsSchema,DEFAULT_WHEEL,nativeArguments,parseWheelMessage,wheelSlot} from '../src/main/music/wheelProtocol';
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
});
