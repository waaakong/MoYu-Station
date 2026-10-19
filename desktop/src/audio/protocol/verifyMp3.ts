/** Bounded, non-persistent MPEG Layer III verification; ID3 alone is not audio. */
export function hasMp3Frames(bytes:Uint8Array):boolean {
  let offset=0;
  if(bytes[0]===73&&bytes[1]===68&&bytes[2]===51){
    if(bytes.length<10||![2,3,4].includes(bytes[3]!)||bytes[4]===255||[6,7,8,9].some(i=>(bytes[i]!&128)!==0))return false;
    offset=10+((bytes[6]!<<21)|(bytes[7]!<<14)|(bytes[8]!<<7)|bytes[9]!)+(bytes[3]===4&&(bytes[5]!&16)!==0?10:0);
  }
  const frame=(at:number)=>{
    if(at+4>bytes.length||bytes[at]!==255||(bytes[at+1]!&224)!==224)return;
    const version=(bytes[at+1]!>>3)&3,layer=(bytes[at+1]!>>1)&3,bitrate=bytes[at+2]!>>4,rate=(bytes[at+2]!>>2)&3;
    if(version===1||layer!==1||bitrate===0||bitrate===15||rate===3)return;
    const kbps=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrate]!;
    const hz=[44100,48000,32000][rate]!/(version===3?1:version===2?2:4);
    return{length:Math.floor((version===3?144:72)*kbps*1000/hz)+((bytes[at+2]!>>1)&1),version,rate};
  };
  const first=frame(offset);if(!first)return false;
  const second=frame(offset+first.length);
  return !!second&&first.version===second.version&&first.rate===second.rate&&offset+first.length+second.length<=bytes.length;
}

export async function verifyMp3Prefix(url:URL,signal:AbortSignal,fetcher:typeof fetch):Promise<boolean>{
  const response=await fetcher(url,{headers:{Range:'bytes=0-65535'},redirect:'error',signal});
  if(!response.body)return false;
  const reader=response.body.getReader();
  try{
    if(response.status!==206||!/^bytes 0-\d+\/\d+$/.test(response.headers.get('content-range')??''))return false;
    let used=0;const prefix=new Uint8Array(65536);
    while(used<prefix.length){
      signal.throwIfAborted();const next=await reader.read();if(next.done)break;
      const length=Math.min(next.value.length,prefix.length-used);prefix.set(next.value.subarray(0,length),used);used+=length;
      if(hasMp3Frames(prefix.subarray(0,used)))return true;
    }
    return hasMp3Frames(prefix.subarray(0,used));
  }finally{await reader.cancel();}
}
