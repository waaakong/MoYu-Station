import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../src/renderer/lyrics.js',import.meta.url),'utf8');
describe('transparent lyrics renderer',()=>{
 it('initializes without old appearance controls and applies actual frame appearance without replacing toolbar icons',()=>{
  const nodes=new Map<string,any>();const make=()=>({style:{setProperty:vi.fn()},setAttribute:vi.fn(),querySelector:()=>({setAttribute:vi.fn()}),replaceChildren:vi.fn(),addEventListener:vi.fn(),classList:{toggle:vi.fn()},hidden:false,textContent:'',title:''});
  for(const id of ['line','next','title','play','status','viewport'])nodes.set(id,make());
  let receive!:(frame:any)=>void;
  const document={getElementById:(id:string)=>nodes.get(id),querySelectorAll:()=>[],body:{style:{setProperty:vi.fn()},classList:{toggle:vi.fn()}},hidden:false,addEventListener:vi.fn()};
  runInNewContext(script,{document,window:{moyuLyrics:{onFrame:(cb:any)=>receive=cb}},matchMedia:()=>({matches:false,addEventListener:vi.fn()}),performance:{now:()=>1000},requestAnimationFrame:vi.fn(),cancelAnimationFrame:vi.fn()});
  receive({title:'合成曲目',line:'真实一行',nextLine:'下一句',trackKey:'one',lineKey:'one:1',playing:false,positionMs:0,status:'已暂停',style:{fontSize:36,highlight:'#abcdef',base:'#123456',opacity:.75,fontFamily:'serif',rows:1}});
  expect(nodes.get('line').textContent).toBe('真实一行');expect(nodes.get('next').hidden).toBe(true);expect(nodes.get('status').hidden).toBe(true);
  expect(nodes.get('play').setAttribute).toHaveBeenCalledWith('aria-label','播放');expect(nodes.get('play').textContent).toBe('');
  expect(document.body.style.setProperty).toHaveBeenCalledWith('--base','#123456');expect(document.body.style.setProperty).toHaveBeenCalledWith('--lyric-opacity','0.75');
  receive({title:'合成曲目',line:'真实一行',nextLine:'',trackKey:'one',lineKey:'one:1',playing:false,status:'网络暂不可用'});expect(nodes.get('status').textContent).toBe('网络暂不可用');expect(nodes.get('status').hidden).toBe(false);
 });
});
