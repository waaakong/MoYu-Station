import type {StagePreferences} from '@studyroom/contracts';
import {approvedFlowFragment} from './approvedFlowShader';
type Point={x:number;y:number;z:number;r:number;g:number;b:number;l:number;edge:number};
export interface BackgroundInput {tone?:string;time:number;energy:number;bass:number;frequency:Uint8Array<ArrayBuffer>|null;waveform:Uint8Array<ArrayBuffer>|null;preferences:StagePreferences;moving:boolean;pure:boolean;quality:number}
const seed=(i:number)=>{const v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const rgba=(r:number,g:number,b:number,a:number)=>`rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
/** Same geometry, palette and compositing as the approved v17 preview; no synthetic audio. */
export class PreviewBackgroundRenderer {
  private gl:WebGLRenderingContext|null=null;
  private program?:WebGLProgram;
  private buffer?:WebGLBuffer;
  private uniforms:Record<string,WebGLUniformLocation|null>={};
  private glow=document.createElement('canvas');private glowContext:CanvasRenderingContext2D;
  private sprite=document.createElement('canvas');
  private points:Point[]=[];
  private palette=[[.12,.31,.42],[.38,.69,.72],[.72,.47,.25],[.17,.22,.36]];
  private displayPalette=this.palette.map(c=>[...c]);
  private values:number[]=[];private peaks:number[]=[];private lastTime=-1;
  private w=1;private h=1;private disposed=false;
  constructor(private flow:HTMLCanvasElement,private canvas:HTMLCanvasElement){
    this.glowContext=this.glow.getContext('2d')!;this.sprite.width=this.sprite.height=64;
    const ctx=this.sprite.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'#ebfbff');gradient.addColorStop(.12,'#b4e9ffdd');gradient.addColorStop(.4,'#6fc7e54a');gradient.addColorStop(1,'#6fc7e500');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    this.setupFlow();flow.addEventListener('webglcontextlost',this.lost);flow.addEventListener('webglcontextrestored',this.restored);
  }
  private lost=(event:Event)=>{event.preventDefault();this.gl=null;this.program=undefined;this.buffer=undefined;};
  private restored=()=>{if(!this.disposed){this.setupFlow();this.resize(this.w,this.h,devicePixelRatio);}};
  private setupFlow(){
    let gl:WebGLRenderingContext|null=null,program:WebGLProgram|undefined,buffer:WebGLBuffer|undefined;const shaders:WebGLShader[]=[];
    try{
      gl=this.flow.getContext('webgl',{alpha:true,antialias:false,powerPreference:'low-power'});if(!gl)return;
      const shader=(type:number,source:string)=>{const s=gl!.createShader(type);if(!s)throw Error();shaders.push(s);gl!.shaderSource(s,source);gl!.compileShader(s);if(!gl!.getShaderParameter(s,gl!.COMPILE_STATUS))throw Error();return s;};
      program=gl.createProgram()||undefined;if(!program)throw Error();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,approvedFlowFragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error();
      gl.useProgram(program);buffer=gl.createBuffer()||undefined;if(!buffer)throw Error();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const attr=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
      this.gl=gl;this.program=program;this.buffer=buffer;this.uniforms={};for(const name of ['uSize','uTime','uEnergy','uDepth','c0','c1','c2','c3'])this.uniforms[name]=gl.getUniformLocation(program,name);
    }catch{if(gl&&program)gl.deleteProgram(program);if(gl&&buffer)gl.deleteBuffer(buffer);this.gl=null;}
    finally{for(const shader of shaders)gl?.deleteShader(shader);}
  }
  resize(width:number,height:number,dpr:number){
    this.w=Math.max(1,width);this.h=Math.max(1,height);
    const ratio=Math.min(1.5,Math.max(1,dpr||1),Math.sqrt(2500000/(this.w*this.h)));
    this.canvas.width=Math.ceil(this.w*ratio);this.canvas.height=Math.ceil(this.h*ratio);
    const flowRatio=Math.min(1,Math.sqrt(650000/(this.w*this.h)));
    this.flow.width=Math.ceil(this.w*flowRatio);this.flow.height=Math.ceil(this.h*flowRatio);this.gl?.viewport(0,0,this.flow.width,this.flow.height);
    this.glow.width=Math.ceil(this.w*.36);this.glow.height=Math.ceil(this.h*.36);
  }
  setCover(image:HTMLImageElement|null){
    this.points=[];this.palette=[[.12,.31,.42],[.38,.69,.72],[.72,.47,.25],[.17,.22,.36]];if(!image?.complete||!image.naturalWidth)return;
    const sample=document.createElement('canvas');sample.width=sample.height=72;
    try{
      const ctx=sample.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,72,72);const data=ctx.getImageData(0,0,72,72).data,sum=[0,0,0];let saturation=0;
      for(let y=0;y<72;y++)for(let x=0;x<72;x++){const at=(y*72+x)*4,r=data[at]/255,g=data[at+1]/255,b=data[at+2]/255,l=r*.2126+g*.7152+b*.0722,edge=Math.abs(r-data[(y*72+Math.min(71,x+1))*4]/255);sum[0]+=r;sum[1]+=g;sum[2]+=b;saturation+=Math.max(r,g,b)-Math.min(r,g,b);if(l>.025)this.points.push({x:(x/71-.5)*2,y:(.5-y/71)*2,z:(l-.5)*.55+edge*.5,r,g,b,l,edge});}
      if(saturation/5184>.12){const avg=sum.map(v=>v/5184);this.palette=[avg.map(v=>v*.7),avg.map(v=>Math.min(1,v*1.25+.15)),[avg[2]*.8+.15,avg[0]*.6+.1,avg[1]*.6+.1],[.1,.16,.24]];}
    }catch{this.points=[];}finally{sample.width=sample.height=1;}
  }
  private dot(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,alpha:number){ctx.globalAlpha=alpha;ctx.drawImage(this.sprite,x-size,y-size,size*2,size*2);}
  draw(input:BackgroundInput){
    if(this.disposed)return;
    const {preferences:p}=input,ctx=this.canvas.getContext('2d')!;
    ctx.setTransform(this.canvas.width/this.w,0,0,this.canvas.height/this.h,0,0);ctx.clearRect(0,0,this.w,this.h);
    this.flow.style.opacity=p.background==='off'?'0':'';if(p.background==='off')return;
    const gl=this.gl;if(gl&&this.program){gl.useProgram(this.program);gl.uniform2f(this.uniforms.uSize,this.flow.width,this.flow.height);gl.uniform1f(this.uniforms.uTime,input.time);gl.uniform1f(this.uniforms.uEnergy,input.energy);gl.uniform1f(this.uniforms.uDepth,p.depth);const palette=input.tone==='ember'?[[.35,.14,.09],[.76,.46,.27],[.58,.28,.18],[.2,.13,.2]]:input.tone==='moon'?[[.18,.22,.29],[.54,.65,.76],[.45,.5,.58],[.16,.19,.25]]:this.palette;palette.forEach((c,i)=>{c.forEach((v,j)=>this.displayPalette[i][j]+=(v-this.displayPalette[i][j])*(input.moving?.065:1));gl.uniform3fv(this.uniforms['c'+i],this.displayPalette[i]);});gl.drawArrays(gl.TRIANGLES,0,6);}
    const w=this.w,h=this.h,time=input.time;ctx.save();ctx.globalCompositeOperation='screen';
    if(p.background==='cover')for(let i=0;i<26;i++)this.dot(ctx,seed(i*3)*w,(seed(i*3+1)*h+time*(1+seed(i)*2))%h,2+seed(i+4)*4,.08+seed(i+8)*.1);
    else if(p.background==='spectrum')this.spectrum(ctx,input);
    else if(p.background==='wave')this.wave(ctx,input);
    else this.nebula(ctx,input);
    ctx.restore();this.lastTime=time;
  }
  private spectrum(ctx:CanvasRenderingContext2D,input:BackgroundInput){
    const {w,h}=this,{preferences:p}=input,count=w<600?52:100,total=Math.min(w*.86,1050),gap=total/count,base=h*(input.pure?.64:.77),max=Math.min(h*.34,total*.3)*(input.pure?1:.7),frequency=input.frequency;
    const values=Array.from({length:count},(_,i)=>frequency?.[Math.min(frequency.length-1,Math.floor((Math.exp(i/(count-1)*Math.log(1+(frequency.length||1)*.75))-1))) ]!/255||0);
    const jump=Math.abs(input.time-this.lastTime)>1.5||this.values.length!==count;if(jump){this.values=[...values];this.peaks=[...values];}
    const advanced=input.moving&&input.time!==this.lastTime;
    for(let i=0;i<count;i++){
      if(advanced){this.values[i]+=(values[i]-this.values[i])*.34;this.peaks[i]=Math.max(this.values[i],this.peaks[i]-.007);}else if(!input.moving&&jump)this.values[i]=values[i];
      const value=this.values[i],height=value*max*(.55+p.intensity*.75),x=w/2-total/2+i*gap,bw=Math.max(2,gap*.34),ratio=i/count,color=ratio<.5?[113+ratio*150,206+ratio*40,244]:[187+(ratio-.5)*110,220-(ratio-.5)*60,232-(ratio-.5)*130];
      if(height<.5)continue;
      const gradient=ctx.createLinearGradient(0,base-height,0,base);gradient.addColorStop(0,'#f3fbff');gradient.addColorStop(.12,rgba(...color as [number,number,number],.95));gradient.addColorStop(1,rgba(color[0]*.4,color[1]*.6,color[2]*.75,.12));ctx.fillStyle=gradient;ctx.globalAlpha=.8;ctx.fillRect(x,base-height,bw,height);
      this.dot(ctx,x+bw/2,base-height,4+value*8,.24+value*.28);ctx.globalAlpha=.62;ctx.fillStyle=rgba(...color as [number,number,number],.9);ctx.fillRect(x,base-this.peaks[i]*max*(.55+p.intensity*.75)-5,bw,1.4);ctx.globalAlpha=.13;ctx.fillRect(x,base+7,bw,height*.36);
    }
    ctx.beginPath();this.values.forEach((v,i)=>{const x=w/2-total/2+(i+.2)*gap,y=base-v*max*(.55+p.intensity*.75);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle='#c4efff';ctx.globalAlpha=input.energy>.005?.25:0;ctx.lineWidth=1;ctx.stroke();
  }
  private wave(ctx:CanvasRenderingContext2D,input:BackgroundInput){
    const {w,h}=this,{preferences:p}=input,time=input.time,amp=Math.min(h*.2,w*.17)*(.2+input.energy*(.65+p.intensity)),segments=input.quality<=24?100:160,lines=input.quality<=24?12:20,glow=this.glowContext;
    const point=(u:number,v:number,layer:number)=>{const e=Math.pow(Math.max(0,Math.sin(u*Math.PI)),.74),travel=time*.16,crest=Math.exp(-Math.pow((u-(.46+Math.sin(time*.11+layer)*.17))*3.7,2)),tide=Math.sin(u*5.8-travel+layer*.92)*.65+Math.sin(u*11.2+travel*.71-layer*.55)*.22,fold=Math.sin(u*7.5-travel*.83+layer*.7+v*.75),spread=(.045+crest*.06)*h*(.7+p.depth*.5),sample=input.waveform?.[Math.floor(u*((input.waveform?.length||1)-1))]??128;return {x:w*(-.08+u*1.16),y:h*(.43+layer*.044)+e*(tide*amp+v*spread*(.5+fold*.5)+(sample-128)/128*h*.035*p.intensity)};};
    glow.setTransform(.36,0,0,.36,0,0);glow.clearRect(0,0,w,h);
    for(let layer=0;layer<3;layer++){
      const color: [number,number,number]=layer===0?[99,187,228]:layer===1?[137,221,220]:[233,193,151];
      const paths=Array.from({length:lines+1},(_,line)=>Array.from({length:segments+1},(_,j)=>point(j/segments,(line/lines-.5)*2,layer)));
      const ribbon=paths[0].concat([...paths[lines]].reverse());
      for(const target of [ctx,glow]){target.beginPath();ribbon.forEach((v,i)=>i?target.lineTo(v.x,v.y):target.moveTo(v.x,v.y));target.closePath();const fill=target.createLinearGradient(w*.1,h*.2,w*.85,h*.67);fill.addColorStop(0,rgba(...color,0));fill.addColorStop(.3,rgba(...color,target===ctx?.018:.13));fill.addColorStop(.65,rgba(...color,target===ctx?.06:.2));fill.addColorStop(1,rgba(...color,0));target.fillStyle=fill;target.globalAlpha=1;target.fill();}
      paths.forEach((points,line)=>{const edge=line===0||line===lines;ctx.beginPath();points.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));const stroke=ctx.createLinearGradient(0,0,w,0);stroke.addColorStop(0,rgba(...color,0));stroke.addColorStop(.18,rgba(...color,.1));stroke.addColorStop(.5,rgba(...color,edge?.7:.15+Math.sin(line/lines*Math.PI)*.12));stroke.addColorStop(.85,rgba(...color,.17));stroke.addColorStop(1,rgba(...color,0));ctx.strokeStyle=stroke;ctx.globalAlpha=1;ctx.lineWidth=edge?1.25:.65;ctx.stroke();if(edge){glow.beginPath();points.forEach((v,i)=>i?glow.lineTo(v.x,v.y):glow.moveTo(v.x,v.y));glow.strokeStyle=rgba(...color,.5);glow.lineWidth=8;glow.stroke();}});
      for(let i=0;i<(input.quality<=24?15:30);i++){const u=(seed(i+layer*59)+time*(.0028+seed(i+5)*.002))%1,v=point(u,seed(i+layer*91+4)*2-1,layer);ctx.globalAlpha=Math.sin(u*Math.PI)*(.18+seed(i+15)*.55);ctx.fillStyle=rgba(...color,1);ctx.beginPath();ctx.arc(v.x,v.y,.55+seed(i+10)*1.1,0,Math.PI*2);ctx.fill();}
    }
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.58;ctx.filter='blur(9px)';ctx.drawImage(this.glow,0,0,w,h);ctx.restore();
  }
  private nebula(ctx:CanvasRenderingContext2D,input:BackgroundInput){
    const {w,h}=this,time=input.time,p=input.preferences,turn=Math.sin(time*.045)*.24-.12,tilt=Math.sin(time*.032)*.1+.07,scale=Math.min(Math.min(w,h)*(input.pure?.28:.24)*(input.pure?1.12:.94),w*.29),cx=w*.5,cy=h*(input.pure?.42:.48);
    for(let layer=0;layer<3;layer++)for(let i=0;i<(w<600?40:85);i++){const id=i+layer*101,a=seed(id)*Math.PI*2+time*.015*(layer%2?-1:1),r=scale*(1.25+seed(id+3)*1.15),z=(layer-1)*.3,per=1/(1.7-z);this.dot(ctx,cx+Math.cos(a)*r*1.65*per,cy+Math.sin(a)*r*.7*per+z*scale*.2,(layer===2?3.5:1.8)+seed(id+5)*3,(layer===2?.23:.12)+seed(id+8)*.1);}
    const skip=w<600?3:input.quality<=24?2:1;
    for(let i=0;i<this.points.length;i+=skip){const point=this.points[i],warp=Math.sin(point.x*3+time*.15)*.028*p.intensity*input.energy,z=point.z*p.depth+warp,rx=point.x*Math.cos(turn)+z*Math.sin(turn),rz=z*Math.cos(turn)-point.x*Math.sin(turn),per=1/(1.5-rz*.4),x=cx+(rx+(seed(i+1)-.5)*.009)*scale*per*1.65,y=cy+(-point.y*Math.cos(tilt)+rz*Math.sin(tilt))*scale*per*1.65;ctx.globalAlpha=(.18+point.l*.72+Math.min(.2,point.edge*2))*(input.pure?1:.65);ctx.fillStyle=rgba(point.r*190+48,point.g*185+62,point.b*178+77,1);ctx.beginPath();ctx.arc(x,y,(1.15+point.l*.9+Math.min(.7,point.edge*3))*per*(w<600?.82:1)*.55,0,Math.PI*2);ctx.fill();if(i%53===0&&point.l>.4)this.dot(ctx,x,y,3.5+point.l*4,.14+point.edge*.4);}
    if(!this.points.length){ctx.globalAlpha=.5;ctx.fillStyle='#cee5e8';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('暂无封面 · 星尘氛围',cx,cy);}
    for(let ring=0;ring<2;ring++){ctx.beginPath();ctx.ellipse(cx,cy+scale*.12,scale*(1.12+ring*.2),scale*(.46+ring*.13),-.2+turn*.1,Math.PI*.1,Math.PI*1.8);ctx.strokeStyle=ring?'#d5c5a1':'#a7d5ed';ctx.globalAlpha=.12;ctx.lineWidth=.6;ctx.stroke();}
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.flow.removeEventListener('webglcontextlost',this.lost);this.flow.removeEventListener('webglcontextrestored',this.restored);if(this.gl&&this.program)this.gl.deleteProgram(this.program);if(this.gl&&this.buffer)this.gl.deleteBuffer(this.buffer);this.program=undefined;this.buffer=undefined;this.gl=null;this.points=[];this.glow.width=this.sprite.width=1;this.canvas.width=this.flow.width=1;}
}
