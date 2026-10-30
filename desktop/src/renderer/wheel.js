'use strict';
const NS='http://www.w3.org/2000/svg',host=document.getElementById('wheel');
const labels={'play-pause':['M7 4v16l13-8Z','播放／暂停'],next:['m6 5 10 7-10 7ZM18 5v14','下一首'],previous:['m18 5-10 7 10 7ZM6 5v14','上一首'],focus:['M12 4v8l5 3M9 2h6M21 13a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z','专注开始／暂停'],sound:['M4 9h4l5-5v16l-5-5H4ZM17 8q5 4 0 8','声音面板'],space:['m4 11 8-8 8 8M6 9v12h12V9M10 21v-7h4v7','返回空间'],lyrics:['M3 5h18v14H3ZM7 10h10M7 14h7','桌面歌词'],mute:['M4 9h4l5-5v16l-5-5H4ZM17 9l5 6m0-6-5 6','音乐静音']};

const art=svg('svg',{viewBox:'-240 -240 480 480',id:'wheel-art','aria-hidden':'true'},host);
const media=matchMedia('(prefers-reduced-motion: reduce)'),gsap=window.gsap;
const hub=document.createElement('span'),caption=document.createElement('strong'),hint=document.createElement('small');hub.id='hub-icon';document.getElementById('center').replaceChildren(hub,caption,hint);
let commands=[];
function svg(tag,attrs={},parent){const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));parent?.append(n);return n;}
function point(radius,angle){const a=angle*Math.PI/180;return [Math.cos(a)*radius,Math.sin(a)*radius];}
function wedge(inner,outer,start,end){const a=point(inner,start),b=point(outer,start),c=point(outer,end),d=point(inner,end);return `M${a}L${b}A${outer},${outer} 0 0 1 ${c}L${d}A${inner},${inner} 0 0 0 ${a}Z`;}
function icon(i){const command=commands[i],n=svg('svg',{viewBox:'0 0 24 24','aria-hidden':'true'});svg('path',{d:labels[command][0],...(command==='play-pause'?{class:'solid'}:{})},n);return n;}
const defs=svg('defs',{},art);
function gradient(id,stops,r=224,cy=0){const g=svg('radialGradient',{id,gradientUnits:'userSpaceOnUse',cx:0,cy,r},defs);stops.forEach(([at,color,opacity=1])=>svg('stop',{offset:at,'stop-color':color,'stop-opacity':opacity},g));}
gradient('ring',[[0,'var(--ring-inner)',.96],[.29,'var(--ring-inner)',.94],[.48,'var(--ring-inner)',.78],[.66,'var(--ring-outer)',.44],[.83,'var(--ring-outer)',.14],[1,'var(--ring-outer)',0]]);
gradient('selected',[[.29,'var(--hot-inner)',.52],[.48,'var(--hot-outer)',.44],[.66,'var(--hot-outer)',.28],[.83,'var(--hot-outer)',.10],[1,'var(--hot-outer)',0]]);
gradient('divider-fade',[[.29,'var(--gold)',.62],[.52,'var(--gold)',.34],[.78,'var(--gold)',.10],[1,'var(--gold)',0]]);
gradient('rays',[[.74,'var(--ray)',.68],[1,'var(--ray)',0]]);
gradient('hub',[[0,'var(--hub-a)'],[1,'var(--hub-b)']],75,-13);
for(let i=0;i<8;i++){const a=-90+i*45;svg('path',{d:wedge(169,224,a-22.5,a+22.5),fill:'url(#rays)',class:'direction-ray'},art);}

for(let i=0;i<8;i++){const a=-90+i*45;svg('path',{d:wedge(66,224,a-22.1,a+22.1),fill:'url(#ring)',class:'sector-base'},art);}
const hot=[],icons=[];
for(let i=0;i<8;i++){const a=-90+i*45;hot.push(svg('path',{d:wedge(66,224,a-22.5,a+22.5),fill:'url(#selected)',class:'sector-hot'},art));const start=point(67,a-22.5),end=point(224,a-22.5);svg('path',{d:`M${start}L${end}`,class:'sector-line',fill:'none'},art);}

function renderIcons(){icons.forEach(({g})=>g.remove());icons.length=0;commands.forEach((command,i)=>{const [x,y]=point(116,-90+i*45),g=svg('g',{transform:`translate(${x},${y})`,class:'icon-position',id:`command-${i}`,role:'button','aria-label':labels[command][1],'aria-pressed':'false'},art),glyph=svg('g',{class:'glyph'},g),n=icon(i);n.setAttribute('x','-15');n.setAttribute('y','-15');n.setAttribute('width','30');n.setAttribute('height','30');glyph.append(n);icons.push({g,glyph});});}
svg('circle',{r:69,fill:'#0c1518','fill-opacity':.78},art);svg('circle',{r:65,fill:'url(#hub)',stroke:'var(--gold)','stroke-width':1.7},art);svg('circle',{r:59,fill:'none',stroke:'var(--gold)','stroke-width':.65,'stroke-opacity':.35},art);

let selected=-2,sequence=0,signature='',disposed=false;
function targets(){return [host,...hot,...icons.map(i=>i.glyph)];}
function animate(target,props){if(gsap)gsap.to(target,{...props,duration:media.matches?0:.1,ease:'power2.out',overwrite:'auto'});else if('opacity'in props)target.style.opacity=String(props.opacity);}
function select(index){if(selected===index)return;selected=index;hot.forEach((n,i)=>animate(n,{opacity:i===index?1:0}));icons.forEach(({g,glyph},i)=>{g.classList.toggle('hot',i===index);g.setAttribute('aria-pressed',String(i===index));animate(glyph,{scale:i===index?1.16:1,svgOrigin:'0 0'});});hub.replaceChildren();if(index<0){hub.textContent='墨';caption.textContent='移向操作';hint.textContent='中心取消';}else{hub.append(icon(index));caption.textContent=labels[commands[index]][1];hint.textContent='松开执行';}host.dataset.selected=String(index);}
function settle(){gsap?.killTweensOf(targets());gsap?.set(host,{clearProps:'opacity,transform'});hot.forEach((n,i)=>n.style.opacity=i===selected?'1':'0');icons.forEach(({glyph},i)=>gsap?.set(glyph,{scale:i===selected?1.16:1,svgOrigin:'0 0'}));}
const unsubscribe=window.moyuWheel.onFrame(frame=>{
  if(disposed||!frame||!Number.isInteger(frame.sequence)||frame.sequence<1||frame.sequence>999999999||frame.sequence<sequence||!Array.isArray(frame.slots)||frame.slots.length!==8||new Set(frame.slots).size!==8||!frame.slots.every(command=>Object.hasOwn(labels,command))||!Number.isInteger(frame.selected)||frame.selected< -1||frame.selected>7)return;
  const next=JSON.stringify(frame.slots),opened=frame.sequence!==sequence;
  if(next!==signature){gsap?.killTweensOf(icons.map(i=>i.glyph));signature=next;commands=[...frame.slots];renderIcons();selected=-2;}
  select(frame.selected);
  if(opened){sequence=frame.sequence;host.dataset.sequence=String(sequence);gsap?.killTweensOf(host);if(!media.matches)gsap?.fromTo(host,{opacity:0,scale:.88},{opacity:1,scale:1,duration:.12,ease:'power3.out',clearProps:'opacity,transform'});else gsap?.set(host,{clearProps:'opacity,transform'});}
});
media.addEventListener('change',settle);document.addEventListener('visibilitychange',()=>{if(document.hidden)settle();});window.addEventListener('pagehide',()=>{disposed=true;settle();unsubscribe?.();media.removeEventListener('change',settle);},{once:true});
select(-1);
