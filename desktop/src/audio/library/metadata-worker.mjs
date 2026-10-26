import {parseFile,selectCover} from 'music-metadata';
const parent=process.parentPort;
const reply=value=>parent?parent.postMessage(value):process.send?.(value);
const text=value=>typeof value==='string'?value.slice(0,512*1024):undefined;
let used=false;
async function receive(message){
  if(used)return;used=true;
  const path=parent?message.data:message;
  if(typeof path!=='string'||path.length>32768){reply({error:'METADATA_INPUT_INVALID'});return;}
  try{
    const metadata=await parseFile(path,{duration:true,skipPostHeaders:true}),cover=selectCover(metadata.common.picture),lyrics=metadata.common.lyrics?.[0];
    const content=lyrics?.text||lyrics?.syncText?.map(line=>`${line.timestamp==null?'':`[${Math.floor(line.timestamp/60).toString().padStart(2,'0')}:${(line.timestamp%60).toFixed(2).padStart(5,'0')}]`}${line.text}`).join('\n');
    reply({title:text(metadata.common.title)?.slice(0,500),artist:text(metadata.common.artist)?.slice(0,500),album:text(metadata.common.album)?.slice(0,500),durationMs:Number.isFinite(metadata.format.duration)?Math.round(metadata.format.duration*1000):undefined,lyrics:text(content),cover:cover&&cover.data.length<=2*1024*1024?{data:cover.data,mime:cover.format}:undefined});
  }catch{reply({error:'METADATA_PARSE_FAILED'});}
}
if(parent)parent.on('message',receive);else process.on('message',receive);
