import type { StickerCollection, StickerFavorite } from '@studyroom/contracts';
import { http } from '../services/http';
import { useAuthStore } from '../stores/auth';
import { featureFlags } from '../config/features';
import { prepareCandidateForUpload } from '../media/prepareCandidate';
import { stickerSession as state,stickerController,type FavoriteJob } from './session';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function parse(value:any):StickerCollection {
  if(!value || !Number.isSafeInteger(value.version) || value.version<0 || !Array.isArray(value.items) || value.items.length>200)throw new Error('收藏响应无效');
  const seen=new Set<string>();
  for(const item of value.items){if(!uuid.test(item.id) || seen.has(item.id) || !uuid.test(item.assetId) || item.clearUrl!==`/api/media/assets/${item.assetId}/clear` || item.thumbUrl!==`/api/media/assets/${item.assetId}/thumb` || !['image/png','image/jpeg','image/webp','image/gif'].includes(item.mime) || !Number.isInteger(item.width) || !Number.isInteger(item.height) || item.width<1 || item.height<1 || item.width>512 || item.height>512)throw new Error('收藏响应无效');seen.add(item.id);}
  return value;
}
export function stickerApi(){
  const auth=useAuthStore(),owner=auth.user?.id,generation=auth.sessionGeneration;
  const current=()=>!!owner && auth.user?.id===owner && auth.sessionGeneration===generation && !auth.authTransition && !auth.isBanned;
  async function request(method:'GET'|'PUT'|'DELETE'|'POST',url:string,data?:unknown){
    const {controller,release}=stickerController();
    const guard=()=>{if(!current() || controller.signal.aborted)throw new DOMException('账号会话已结束','AbortError');};
    try{guard();if(!navigator.onLine)throw new Error('当前离线，未提交修改。请联网后手动重试。');
      const response=await http.request({method,url,data,signal:controller.signal,mediaGuard:guard,timeout:20000,headers:data instanceof Blob?{'Content-Type':data.type}:undefined});
      guard();if(response.data?.success!==true)throw new Error('收藏响应无效');return response.data.data;
    }finally{release();}
  }
  function apply(value:unknown){if(!current())return;const collection=parse(value);if(collection.version>=state.collection.version)state.collection=collection;}
  async function refresh(){
    if(!featureFlags.mediaAssets || !current())return;
    state.loading=true;state.error='';
    try{const capability=await request('GET','/media/capabilities');state.enabled=capability.sticker===true;if(state.enabled)apply(await request('GET','/stickers/favorites'));}
    catch(error){if(current())state.error=error instanceof Error?error.message:'收藏加载失败';}
    finally{if(current())state.loading=false;}
  }
  async function run(job:FavoriteJob){
    if(!current() || !state.enabled || job.state==='working')return;
    job.state='working';job.error='';
    try{
      // The original favorite id is also the commit receipt. Do not create another id on an unknown result.
      apply(await request('GET','/stickers/favorites'));
      if(!state.collection.items.some(item=>item.id===job.id)){
        if(job.file && !job.assetId){
          let receipt=await request('GET',`/media/uploads/${job.uploadId}`);
          if(receipt.status==='missing' || receipt.status==='failed' && receipt.retryable){
            let file=job.file;
            if(file.type!=='image/gif'){
              const {controller,release}=stickerController();try{file=await prepareCandidateForUpload(file,{attachmentId:job.id,requestId:job.uploadId,scope:{accountId:String(owner),target:{kind:'hall'}},signal:controller.signal});}finally{release();}
            }else if(file.size>5*1024*1024)throw new Error('GIF 不得超过 5 MiB。');
            receipt=await request('POST',`/media/assets?clientUploadId=${job.uploadId}&purpose=sticker`,file);
          }
          if(receipt.status!=='ready' || !uuid.test(receipt.asset?.id))throw new Error('上传结果尚未确认，请重试原任务。');job.assetId=receipt.asset.id;
        }
        apply(await request('PUT',`/stickers/favorites/${job.id}`,job.messageId?{messageId:job.messageId}:{assetId:job.assetId}));
      }
      if(current())state.jobs=state.jobs.filter(item=>item.id!==job.id);
    }catch(error){if(current()){job.state='unknown';job.error=error instanceof Error?error.message:'结果未确认，请重试原任务';}}
  }
  function add(file?:File,messageId?:string){if(!state.enabled || !current())return;if(messageId!==undefined&&!/^[1-9][0-9]{0,18}$/.test(messageId))throw new Error('消息标识无效');if(state.jobs.length>=10)throw new Error('请先处理已有收藏任务');const job:FavoriteJob={id:crypto.randomUUID(),uploadId:crypto.randomUUID(),file,messageId,state:'unknown',error:''};state.jobs.push(job);void run(state.jobs[state.jobs.length-1]!);}
  async function remove(id:string){try{apply(await request('DELETE',`/stickers/favorites/${id}`));}catch(error){if(current())state.error=`删除未确认，请对同一收藏重试：${error instanceof Error?error.message:''}`;}}
  function move(id:string,delta:number){const ids=ordered().map(item=>item.id),index=ids.indexOf(id),next=index+delta;if(index<0 || next<0 || next>=ids.length)return;[ids[index],ids[next]]=[ids[next]!,ids[index]!];if(!state.orderIntent)state.orderVersion=state.collection.version;state.orderIntent=ids;}
  function ordered():StickerFavorite[]{const items=state.collection.items,ids=state.orderIntent;if(!ids)return items;return [...ids.map(id=>items.find(item=>item.id===id)).filter((item):item is StickerFavorite=>!!item),...items.filter(item=>!ids.includes(item.id))];}
  async function saveOrder(){if(!state.orderIntent)return;try{
    const version=state.orderConflict?state.collection.version:state.orderVersion;
    apply(await request('PUT','/stickers/favorites/order',{version,ids:ordered().map(item=>item.id)}));state.orderIntent=null;state.orderConflict=false;
  }catch(error){if(current()){state.orderConflict=true;await refresh();state.error=`排序未确认，已保留你的顺序，请检查后再次确认：${error instanceof Error?error.message:''}`;}}}
  return {refresh,run,add,remove,move,ordered,saveOrder};
}
