'use strict';
const nodes={title:document.getElementById('title'),line:document.getElementById('line'),next:document.getElementById('next'),status:document.getElementById('status')};
window.moyuLyrics.onFrame(frame=>{
  nodes.title.textContent=frame.title;nodes.line.textContent=frame.line;nodes.next.textContent=frame.nextLine;
  nodes.status.textContent=frame.locked?'已锁定 · 可在主窗口“歌词与快捷键”中解锁':frame.status;
});
for(const action of ['close','lock'])document.getElementById(action).addEventListener('click',()=>{window.moyuLyrics.action(action).catch(()=>{nodes.status.textContent='设置未保存，请在主窗口重试。';});});
