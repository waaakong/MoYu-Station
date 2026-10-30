import lyricHtml from '../../../desktop/src/renderer/lyrics.html?raw';
import lyricCss from '../../../desktop/src/renderer/lyrics.css?raw';
import lyricJs from '../../../desktop/src/renderer/lyrics.js?raw';
import wheelHtml from '../../../desktop/src/renderer/wheel.html?raw';
import wheelCss from '../../../desktop/src/renderer/wheel.css?raw';
import wheelJs from '../../../desktop/src/renderer/wheel.js?raw';
import wheelGsap from 'gsap/dist/gsap.min.js?raw';
const lyrics=document.querySelector<HTMLIFrameElement>('#lyrics')!,wheel=document.querySelector<HTMLIFrameElement>('#wheel')!;
function documentSource(html:string,css:string,script:string,bootstrap:string){return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/,'').replace(/<link rel="stylesheet"[^>]+>/,`<style>${css}</style>`).replace('<script src="gsap.min.js"></script>',`<script>${wheelGsap.replaceAll('</script','<\\/script')}<\/script>`).replace(/<script src="(?:lyrics|wheel)\.js"><\/script>/,`<script>${bootstrap}\n${script.replaceAll('</script','<\\/script')}<\/script>`);}
lyrics.srcdoc=documentSource(lyricHtml,lyricCss,lyricJs,`window.moyuLyrics={onFrame(cb){window.addEventListener('message',e=>{if(e.source===parent&&e.data?.type==='frame')cb(e.data.frame)});},action(command){parent.postMessage({type:'action',command},'*');return Promise.resolve();}};`);
wheel.srcdoc=documentSource(wheelHtml,wheelCss,wheelJs,`window.moyuWheel={onFrame(cb){window.addEventListener('message',e=>{if(e.source===parent&&e.data?.type==='frame')cb(e.data.frame)});}};`);
const lines=['让晚风，慢一点','把时间留在山海之间','听见风经过窗前','这一刻，不必追赶时间'];let line=0,selected=-1;
function lyricFrame(){lyrics.contentWindow?.postMessage({type:'frame',frame:{title:'合成验收',trackKey:'synthetic',lineKey:String(line),line:lines[line%4],nextLine:lines[(line+1)%4],playing:true,status:'播放中',positionMs:line*2000,locked:false,style:{fontSize:38,highlight:'#d8e6ad',base:'#aab7a3',rows:2,opacity:.85,fontFamily:'system',smoothScroll:true}}},'*');}
function wheelFrame(){wheel.contentWindow?.postMessage({type:'frame',frame:{sequence:1,selected,slots:['play-pause','next','focus','sound','space','lyrics','mute','previous']}},'*');}
lyrics.addEventListener('load',lyricFrame);wheel.addEventListener('load',wheelFrame);
document.querySelector('#advance')!.addEventListener('click',()=>{line++;lyricFrame();});document.querySelector('#selection')!.addEventListener('click',()=>{selected=(selected+1)%8;wheelFrame();});
window.addEventListener('message',e=>{if(e.source!==lyrics.contentWindow||e.data?.type!=='action')return;document.querySelector('#result')!.textContent='歌词操作：'+String(e.data.command);});
