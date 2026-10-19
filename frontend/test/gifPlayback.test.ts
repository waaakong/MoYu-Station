import { describe,expect,it,vi } from 'vitest';
import { GifPlaybackBudget } from '../src/media/gifPlayback';
describe('GIF playback budget',()=>{
  it('admits at most two visible animations and releases slots on scroll or disposal',()=>{
    const budget=new GifPlaybackBudget(),callbacks=Array.from({length:4},()=>vi.fn());
    const entries=callbacks.map(callback=>budget.register(callback));entries.forEach(entry=>entry.visible(true));
    expect(callbacks.map(callback=>callback.mock.lastCall?.[0]??false)).toEqual([true,true,false,false]);
    entries[0]!.visible(false);expect(callbacks[0]).toHaveBeenLastCalledWith(false);expect(callbacks[2]).toHaveBeenLastCalledWith(true);
    entries[1]!.dispose();expect(callbacks[3]).toHaveBeenLastCalledWith(true);
  });
  it('background and reduced motion release every decoder until explicitly allowed',()=>{
    const budget=new GifPlaybackBudget(),a=vi.fn(),b=vi.fn();budget.register(a).visible(true);budget.register(b).visible(true);
    budget.allow(false);expect(a).toHaveBeenLastCalledWith(false);expect(b).toHaveBeenLastCalledWith(false);
    budget.allow(true);expect(a).toHaveBeenLastCalledWith(true);expect(b).toHaveBeenLastCalledWith(true);
  });
});
