import {describe,it,expect,vi} from 'vitest';
import {BackgroundLoop} from '../src/pages/sound/stage/backgroundLoop';
describe('stage background RAF ownership',()=>{
  it('binds browser RAF methods to their host object',()=>{
    vi.stubGlobal('requestAnimationFrame',function(this:unknown){if(this!==globalThis)throw new TypeError('Illegal invocation');return 42;});
    const cancel=vi.fn(function(this:unknown){if(this!==globalThis)throw new TypeError('Illegal invocation');});vi.stubGlobal('cancelAnimationFrame',cancel);
    try{const loop=new BackgroundLoop(()=>{});loop.start();loop.dispose();expect(cancel).toHaveBeenCalledWith(42);}finally{vi.unstubAllGlobals();}
  });
  it('does not duplicate loops and cannot restart after disposal',()=>{
    const pending=new Map<number,FrameRequestCallback>();let id=0;const cancel=vi.fn((n:number)=>pending.delete(n)),draw=vi.fn();
    const loop=new BackgroundLoop(draw,cb=>{pending.set(++id,cb);return id;},cancel,()=>0);
    loop.start();loop.start();expect(pending.size).toBe(1);
    const cb=pending.get(1)!;pending.delete(1);cb(100);expect(draw).toHaveBeenCalledTimes(1);expect(pending.size).toBe(1);
    loop.stop();expect(pending.size).toBe(0);loop.dispose();loop.start();expect(pending.size).toBe(0);
  });
  it('respects the rendering ceiling and reduces expensive auto work',()=>{
    let callback!:FrameRequestCallback,clock=0;const draw=vi.fn((_time:number,_fps:number)=>{clock+=30;});
    const loop=new BackgroundLoop(draw,cb=>{callback=cb;return 1;},()=>{},()=>clock);
    loop.configure('auto');loop.start();for(let i=0;i<46;i++)callback(i*50);
    expect(draw.mock.calls.at(-1)?.[1]).toBe(24);loop.dispose();
  });
});
