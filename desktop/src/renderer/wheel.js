'use strict';
const labels={'play-pause':['▶','播放／暂停'],next:['⏭','下一首'],previous:['⏮','上一首'],focus:['◷','专注'],sound:['♫','声音面板'],space:['⌂','返回空间'],lyrics:['≋','桌面歌词'],mute:['♩','音乐静音']};
let signature='';
window.moyuWheel.onFrame(frame=>{
  const next=JSON.stringify(frame.slots);if(next!==signature){signature=next;document.querySelectorAll('.slot').forEach(n=>n.remove());frame.slots.forEach((command,i)=>{const value=labels[command];if(!value)return;const node=document.createElement('div');node.className='slot';const angle=(i*45-90)*Math.PI/180;node.style.transform=`translate(${Math.cos(angle)*119}px,${Math.sin(angle)*119}px)`;const icon=document.createElement('b');icon.textContent=value[0];const text=document.createElement('span');text.textContent=value[1];node.append(icon,text);document.getElementById('wheel').append(node);});}
  document.querySelectorAll('.slot').forEach((node,i)=>node.classList.toggle('selected',i===frame.selected));
});
