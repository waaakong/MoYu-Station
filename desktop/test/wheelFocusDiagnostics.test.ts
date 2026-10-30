import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({env:{} as Record<string,string>,exe:'',append:vi.fn(),mkdir:vi.fn(),path:vi.fn(()=>'/synthetic')}));
vi.mock('electron',()=>({app:{getPath:mock.path}}));
vi.mock('node:fs',()=>({mkdirSync:mock.mkdir,appendFileSync:mock.append}));
vi.mock('node:process',()=>({env:mock.env,get execPath(){return mock.exe;},pid:123}));
import {createWheelFocusDiagnostics} from '../src/main/music/wheelFocusDiagnostics';
describe('opt-in local wheel diagnostics',()=>{
  beforeEach(()=>{mock.env.STUDYROOM_WHEEL_FOCUS_DIAGNOSTICS='1';mock.exe='Provider Experimental.exe';mock.append.mockReset();mock.mkdir.mockClear();mock.path.mockClear();});
  afterEach(()=>vi.restoreAllMocks());
  it('stays disabled without opt-in and for the formal client',()=>{
    mock.env.STUDYROOM_WHEEL_FOCUS_DIAGNOSTICS='0';expect(createWheelFocusDiagnostics()).toBeUndefined();
    mock.env.STUDYROOM_WHEEL_FOCUS_DIAGNOSTICS='1';mock.exe='MoYu.exe';expect(createWheelFocusDiagnostics()).toBeUndefined();expect(mock.path).not.toHaveBeenCalled();
  });
  it('only writes bounded scalar fields and rejects arbitrary content',()=>{
    const log=createWheelFocusDiagnostics()!;log('foreground',{owned:false,topmost:true,password:99,title:123,error:Infinity});log('arbitrary-private-event',{error:5});
    expect(mock.append).toHaveBeenCalledOnce();const row=JSON.parse(mock.append.mock.calls[0]![1]);expect(row).toEqual({at:expect.any(Number),event:'foreground',owned:false,topmost:true});
  });
  it('caps the number and lifetime of observations',()=>{
    const now=vi.spyOn(Date,'now').mockReturnValue(1000);const log=createWheelFocusDiagnostics()!;
    for(let i=0;i<140;i++)log('transfer',{sequence:i,granted:false,error:5});expect(mock.append).toHaveBeenCalledTimes(128);
    mock.append.mockClear();const later=createWheelFocusDiagnostics()!;now.mockReturnValue(1000+16*60_000);later('after',{focused:false});expect(mock.append).not.toHaveBeenCalled();
  });
  it('keeps command handling usable when the local diagnostic write fails',()=>{
    mock.append.mockImplementation(()=>{throw new Error('synthetic write failure');});expect(()=>createWheelFocusDiagnostics()!('after',{focused:false})).not.toThrow();
  });
});
