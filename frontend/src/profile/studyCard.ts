import type { ShareCard } from '../services/profile';

export const studyQuotes = [
  '把时间留给自己，让进步慢慢发生。','今天的一点专注，也值得好好收藏。',
  '不赶路的时候，也在走向自己。','把心安放此刻，把答案交给时间。',
  '慢一点没关系，认真就是方向。','在安静里积累，在日常里生长。',
  '给世界按下暂停，给自己一段时间。','一页书，一段光，一个专注的你。',
  '不必每刻发光，稳稳向前就好。','今天走过的每一步，都算数。'
] as const;
export type CardOptions = { focus: boolean; fish: boolean; effort: boolean };
export type StudyCard = { nickname: string; date: string; scene: string; quote: string; options: CardOptions; focus: number|null; fish: number|null; effort: number|null; fishTimingBasis?:ShareCard['fishTimingBasis'] };
export function nextQuote(previous: number, random=Math.random()) { return (previous+1+Math.min(studyQuotes.length-2,Math.max(0,Math.floor(random*(studyQuotes.length-1)))))%studyQuotes.length; }
const metric = (value: unknown) => typeof value==='number' && Number.isFinite(value) && value>=0 ? value : null;
export function studyCardSnapshot(report:ShareCard,nickname:string,options:CardOptions,quote:number):StudyCard {
  return { nickname:nickname.slice(0,40)||'我',date:report.timeZone==='Asia/Shanghai' && /^\d{4}-\d{2}-\d{2}$/.test(report.statDate||'')?report.statDate!:'日期不可用',
    scene:report.favoriteScene||'暂无',quote:studyQuotes[quote]||studyQuotes[0],options:{...options},focus:metric(report.focusMinutes),fish:metric(report.fishMinutes),effort:metric(report.fakeEffortIndex),fishTimingBasis:report.fishTimingBasis };
}
export function cardMetrics(card:StudyCard) {
  return ([['focus','专注分钟',card.focus,'分钟'],['fish','摸鱼分钟',card.fish,'分钟'],['effort','假努力指数',card.effort,'']] as const)
    .filter(([key])=>card.options[key]).map(([key,label,value,unit])=>({label,text:value===null?'暂无':`${key==='effort'?value.toFixed(2):value}${unit?' '+unit:''}`}));
}
const timingLabel=(card:StudyCard)=>card.fishTimingBasis==='RELAX_PAGE'?'摸鱼为片刻放松页面累计，仅含新口径采集后记录。':'摸鱼为历史旧口径：在线但未专注。';
export function cardTranscript(card:StudyCard) { return [card.nickname,card.date,card.quote,...cardMetrics(card).map(item=>`${item.label}：${item.text}`),...(card.options.fish?[timingLabel(card)]:[]),`常用场景：${card.scene}`].join(' · '); }
export function paintStudyCard(canvas:HTMLCanvasElement,card:StudyCard,image:HTMLImageElement) {
  canvas.width=1200;canvas.height=675;
  const c=canvas.getContext('2d');if(!c || !image.naturalWidth || !image.naturalHeight)throw new Error('卡片画布或背景不可用');
  const scale=Math.max(1200/image.naturalWidth,675/image.naturalHeight);
  c.drawImage(image,(1200-image.naturalWidth*scale)/2,(675-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);
  const shade=c.createLinearGradient(0,0,0,675);shade.addColorStop(0,'rgba(5,12,14,.48)');shade.addColorStop(.48,'rgba(5,12,14,.36)');shade.addColorStop(1,'rgba(5,12,14,.64)');
  c.fillStyle=shade;c.fillRect(0,0,1200,675);c.shadowColor='rgba(0,0,0,.72)';c.shadowBlur=5;c.shadowOffsetY=2;c.fillStyle='#f0f2f1';
  const text=(value:string,x:number,y:number,size:number,max=1028)=>{c.font=`${size}px "Microsoft YaHei", sans-serif`;while(c.measureText(value).width>max&&size>18)c.font=`${--size}px "Microsoft YaHei", sans-serif`;c.fillText(value,x,y,max);};
  text('MOYU / STUDY REPORT',86,95,18);c.textAlign='right';text(card.date,1114,95,18);c.textAlign='left';
  text(card.nickname+'的学习片刻',86,170,44);text(card.quote,86,240,30);
  const metrics=cardMetrics(card);const width=(1028-22*(metrics.length-1))/Math.max(1,metrics.length);
  if(metrics.length)metrics.forEach((item,i)=>{text(item.label,86+i*(width+22),366,20,width-22);text(item.text,86+i*(width+22),424,37,width-22);});
  else text('留一段安静的时间，给自己。',86,405,26);
  text('常用场景 · '+card.scene,86,536,21);
  if(card.options.effort)text('假努力指数为趣味指标，不作为能力评价。',86,580,17,660);
  if(card.options.fish)text(timingLabel(card),86,610,17,750);
  c.textAlign='right';text('墨屿 · 把时间留给自己',1114,620,18);c.textAlign='left';
}
