import {describe,it,expect,vi} from 'vitest';
import {studyCardSnapshot,nextQuote,studyQuotes,cardMetrics,cardTranscript,paintStudyCard} from '../src/profile/studyCard';
const options={focus:true,fish:true,effort:true};
describe('real study card',()=>{
  it('exports all six metrics and preserves a frozen date/value/options snapshot',()=>{
    const report={statDate:'2020-01-02',timeZone:'Asia/Shanghai',focusMinutes:35,onlineMinutes:100,fishMinutes:20,streakDays:4,totalFocusHours:12.5,fakeEffortIndex:.75};
    const keys=['focus','streak','total','online','fish','effort'] as const;
    for(let mask=0;mask<64;mask++){const chosen=Object.fromEntries(keys.map((key,bit)=>[key,!!(mask&(1<<bit))])) as any;const card=studyCardSnapshot(report,'测试员',chosen,0);expect(cardMetrics(card)).toHaveLength(keys.filter((_,i)=>!!(mask&(1<<i))).length);expect(cardTranscript(card)).toContain('2020-01-02');}
    const selected={focus:true,streak:true,total:true,online:true,fish:true,effort:true};const frozen=studyCardSnapshot(report,'测试员',selected,0);report.onlineMinutes=300;selected.online=false;expect(cardMetrics(frozen)).toContainEqual({label:'今日在线',text:'100 分钟'});expect(cardMetrics(frozen)).toContainEqual({label:'累计专注',text:'12.5 小时'});
    const unavailable=studyCardSnapshot({},'我',selected,0);expect(cardMetrics(unavailable).find(x=>x.label==='连续专注')?.text).toBe('暂无');
  });
  it('retains zero, marks missing metrics/date unavailable and never invents a scene',()=>{
    const card=studyCardSnapshot({focusMinutes:0,fishMinutes:null},'我',options,0);
    expect(cardMetrics(card)).toEqual([{label:'专注分钟',text:'0 分钟'},{label:'摸鱼分钟',text:'暂无'},{label:'假努力指数',text:'暂无'}]);expect(card.date).toBe('日期不可用');expect(card.scene).toBe('暂无');
  });
  it('all eight metric combinations have the same accessible/export selection',()=>{
    for(let mask=0;mask<8;mask++){const selected={focus:!!(mask&1),fish:!!(mask&2),effort:!!(mask&4)};const card=studyCardSnapshot({statDate:'2026-09-28',timeZone:'Asia/Shanghai',focusMinutes:35,fishMinutes:2,fakeEffortIndex:12.5},'测试员',selected,0);expect(cardMetrics(card)).toHaveLength(Object.values(selected).filter(Boolean).length);expect(cardTranscript(card).includes('假努力指数')).toBe(selected.effort);expect(cardTranscript(card)).not.toContain('%');}
  });
  it('random selection does not repeat and drawing has no text background boxes',()=>{
    for(let i=0;i<studyQuotes.length;i++)for(const random of [0,.4,.999])expect(nextQuote(i,random)).not.toBe(i);
    const context={drawImage:vi.fn(),createLinearGradient:()=>({addColorStop:vi.fn()}),fillRect:vi.fn(),fillText:vi.fn(),measureText:()=>({width:1})};
    const canvas={getContext:()=>context,width:0,height:0} as unknown as HTMLCanvasElement;
    paintStudyCard(canvas,studyCardSnapshot({},'我',options,0),{naturalWidth:400,naturalHeight:800} as HTMLImageElement);
    expect(canvas.width).toBe(1200);expect(canvas.height).toBe(675);expect(context.fillRect).toHaveBeenCalledExactlyOnceWith(0,0,1200,675);
  });
});
