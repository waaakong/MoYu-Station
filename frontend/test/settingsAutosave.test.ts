import {afterEach,describe,it,expect,vi} from 'vitest';
import {SettingsAutosave} from '../src/audio/lyrics/settingsAutosave';
afterEach(()=>vi.useRealTimers());
describe('automatic desktop settings persistence',()=>{
  it('coalesces continuous edits and flushes the last value on leaving',async()=>{
    vi.useFakeTimers();let value=1;const writes:number[]=[];
    const queue=new SettingsAutosave(async()=>{writes.push(value);return true;});
    queue.request();value=2;queue.request();expect(writes).toEqual([]);
    await queue.flush();expect(writes).toEqual([2]);await vi.runAllTimersAsync();expect(writes).toEqual([2]);
  });
  it('serializes edits arriving while the previous write is pending',async()=>{
    let value=1,finish!:(ok:boolean)=>void;const writes:number[]=[];
    const queue=new SettingsAutosave(()=>{writes.push(value);return writes.length===1?new Promise(resolve=>finish=resolve):Promise.resolve(true);});
    queue.request();const pending=queue.flush();value=2;queue.request();const same=queue.flush();expect(writes).toEqual([1]);
    finish(true);await Promise.all([pending,same]);expect(writes).toEqual([1,2]);
  });
  it('does not commit partial recordings and requires a new request after a failure',async()=>{
    let recording=true;const save=vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const queue=new SettingsAutosave(save,()=>!recording);queue.request();await queue.flush();expect(save).not.toHaveBeenCalled();
    recording=false;await queue.flush();expect(save).toHaveBeenCalledTimes(1);await queue.flush();expect(save).toHaveBeenCalledTimes(1);
    queue.request();await queue.flush();expect(save).toHaveBeenCalledTimes(2);
  });
});
