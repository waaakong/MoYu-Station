'use strict';
const $=id=>document.getElementById(id),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let frame=null,received=0,key='',track='',inks=[],animations=[],outgoing=null,raf=0;
function stopMotion(){animations.forEach(a=>a.cancel());animations=[];outgoing?.remove();outgoing=null;}
function notice(text){$('status').textContent=text;$('status').hidden=!text;}
function paintWords(){
  if(!frame)return;
  const elapsed=frame.playing?Math.min(750,performance.now()-received):0,target=(frame.positionMs||0)+elapsed;
  inks.forEach((ink,i)=>{const word=frame.words[i],fraction=word.endMs>word.timeMs?Math.min(1,Math.max(0,(target-word.timeMs)/(word.endMs-word.timeMs))):Number(target>=word.timeMs);ink.style.clipPath=`inset(0 ${(1-fraction)*100}% 0 0)`;});
  if(frame.playing&&inks.length&&!document.hidden&&!reduced.matches)raf=requestAnimationFrame(paintWords);
}
window.moyuLyrics.onFrame(value=>{
  const changed=(value.lineKey||value.line)!==key||value.line!==frame?.line,canSlide=changed&&track===value.trackKey&&!!key&&!value.jump&&value.playing&&value.style?.smoothScroll!==false&&!reduced.matches;
  if(changed){
    stopMotion();const old=canSlide?$('line').cloneNode(true):null;$('line').replaceChildren();inks=[];
    if(value.words?.length){for(const word of value.words){const span=document.createElement('span');span.className='word';span.append(document.createTextNode(word.text));const ink=document.createElement('span');ink.className='ink';ink.textContent=word.text;ink.setAttribute('aria-hidden','true');span.append(ink);$('line').append(span);inks.push(ink);}}
    else $('line').textContent=value.line;
    $('next').textContent=value.nextLine;
    if(old){old.removeAttribute('id');old.setAttribute('aria-hidden','true');old.classList.add('outgoing');$('viewport').append(old);outgoing=old;const height=$('line').getBoundingClientRect().height,options={duration:280,easing:'cubic-bezier(0.23, 1, 0.32, 1)'};
      const exit=old.animate([{transform:'translateY(0)',opacity:1},{transform:`translateY(-${height}px) scale(.77)`,opacity:0}],options);exit.onfinish=()=>{old.remove();if(outgoing===old)outgoing=null};
      animations=[exit,$('line').animate([{transform:`translateY(${height}px) scale(.77)`,opacity:.65},{transform:'translateY(0) scale(1)',opacity:1}],options),$('next').animate([{transform:`translateY(${height}px) scale(.77)`,opacity:0},{transform:'translateY(0) scale(.77)',opacity:1}],options)];
    }
  }else if(value.jump)stopMotion();
  key=value.lineKey||value.line;track=value.trackKey;frame=value;received=performance.now();
  $('title').textContent=value.title;document.body.classList.toggle('locked',value.locked);$('play').setAttribute('aria-label',value.playing?'暂停':'播放');$('play').title=value.playing?'暂停':'播放';$('play').querySelector('path').setAttribute('d',value.playing?'M6 4h4v16H6ZM14 4h4v16h-4Z':'M7 4v16l13-8Z');
  notice(['播放中','已暂停','播放已停止','缓冲中',''].includes(value.status)?'':value.status);
  if(value.style){document.body.style.setProperty('--font-size',value.style.fontSize+'px');document.body.style.setProperty('--highlight',value.style.highlight);document.body.style.setProperty('--base',value.style.base||'#aab7a3');document.body.style.setProperty('--lyric-opacity',String(value.style.opacity??.85));document.body.style.fontFamily=value.style.fontFamily==='serif'?'SimSun,serif':value.style.fontFamily==='sans'?'Microsoft YaHei,sans-serif':'Microsoft YaHei,Segoe UI,sans-serif';$('next').hidden=value.style.rows===1;}
  cancelAnimationFrame(raf);paintWords();
});
for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',()=>window.moyuLyrics.action(button.dataset.action).catch(()=>{notice('操作未完成，请在主窗口重试。');}));
reduced.addEventListener('change',stopMotion);document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(raf);if(!document.hidden)paintWords();});
