import {parseSceneSnapshot,type PrivateSceneReceipt,type PrivateScenePicture} from '@studyroom/contracts';
export {parseSceneSnapshot,validScenePicture} from '@studyroom/contracts';
import {cachePrivateScene} from './privateCache';
import {useAuthStore} from '../stores/auth';
import {http} from '../services/http';
import {featureFlags} from '../config/features';
import {sceneUploadFile} from './sceneUploadFile';
import {privateScene as state,privateSceneController,type SceneSlot,type SceneUpload} from './privateSession';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export function privateSceneApi(){
  const auth=useAuthStore(),owner=auth.user?.id,generation=auth.sessionGeneration;
  const current=()=>!!owner && owner===auth.user?.id && generation===auth.sessionGeneration && !auth.authTransition && !auth.isBanned;
  async function request(method:'GET'|'PUT'|'DELETE'|'POST',url:string,data?:unknown){
    const {controller,release}=privateSceneController();const guard=()=>{if(!current() || controller.signal.aborted)throw new DOMException('账号已切换','AbortError');};
    try{guard();if(!navigator.onLine)throw new Error('当前离线，未提交修改。联网后请手动重试。');
      const response=await http.request({method,url,data,signal:controller.signal,mediaGuard:guard,timeout:20000,headers:data instanceof Blob?{'Content-Type':data.type}:undefined});guard();
      if(response.data?.success!==true)throw new Error('场景请求未确认');return response.data.data;
    }finally{release();}
  }
  function apply(value:unknown){const snapshot=parseSceneSnapshot(value);if(!current())return;if(!state.saved || snapshot.version>=state.saved.version){state.saved=snapshot;state.owner=String(owner);if(snapshot.deleted)state.active=false;void cachePrivateScene(snapshot,current,String(owner));}}
  async function refresh(){if(!current() || !featureFlags.mediaAssets || state.loading)return;state.loading=true;
    try{const capability=await request('GET','/media/capabilities');state.enabled=capability.scene===true;if(state.enabled){apply(await request('GET','/scenes/custom'));state.error='';}else {state.active=false;state.error='';}}
    catch(error){if(current())state.error=error instanceof Error?error.message:'场景同步失败';}finally{if(current())state.loading=false;}}
  function edit(){if(!current() || state.draft || state.pending)return;state.draftVersion=state.saved?.version||0;state.draft=state.saved?.config?clone(state.saved.config):null;}
  async function upload(job:SceneUpload){if(!current() || job.busy || state.pending || !state.uploads.includes(job))return;job.busy=true;job.error='';
    try{job.file=await sceneUploadFile(job.file);if(!current() || !state.uploads.includes(job))return;let result=await request('GET',`/media/uploads/${job.id}`);
      if(result.status==='missing' || result.status==='failed' && result.retryable)result=await request('POST',`/media/assets?clientUploadId=${job.id}&purpose=scene`,job.file);
      if(result.status!=='ready' || !uuid.test(result.asset?.id) || result.asset.purpose!=='scene')throw new Error('图片处理尚未确认，请重试原任务。');
      if(!state.uploads.includes(job))return;
      const picture:PrivateScenePicture={assetId:result.asset.id,fit:'cover',focalX:.5,focalY:.5,zoom:1,dim:.2};
      if(!state.draft){if(job.slot!=='default')throw new Error('请先上传默认图');state.draft={name:'我的窗景',defaultImage:picture,periods:{}};state.draftVersion=state.saved?.version||0;}
      if(job.slot==='default')state.draft.defaultImage=picture;else state.draft.periods[job.slot]=picture;
      state.uploads=state.uploads.filter(item=>item.id!==job.id);
    }catch(error){if(current() && state.uploads.includes(job))job.error=error instanceof Error?error.message:'上传失败';}finally{job.busy=false;}}
  function add(file:File,slot:SceneSlot){if(!current() || !state.enabled || state.pending)return;state.error='';
    if(state.uploads.some(job=>job.slot===slot)){state.error='请先完成或移除此时段的上传任务。';return;}
    state.uploads.push({id:crypto.randomUUID(),slot,file,busy:false,error:''});void upload(state.uploads[state.uploads.length-1]!);}
  async function submit(deleting=false){if(!current() || state.busy || state.uploads.length || !state.enabled || !deleting && !state.draft && !state.pending)return;
    state.busy=true;state.error='';
    try{
      if(!state.pending)state.pending={version:state.conflict?state.saved?.version||0:deleting?state.saved?.version||0:state.draftVersion,requestId:crypto.randomUUID(),deleting,...(!deleting?{config:clone(state.draft!)}:{})};
      const pending=state.pending;
      let receipt:PrivateSceneReceipt=await request('GET',`/scenes/custom/requests/${pending.requestId}`);
      if(receipt.status==='missing')receipt=await request(pending.deleting?'DELETE':'PUT','/scenes/custom',{version:pending.version,requestId:pending.requestId,...(!pending.deleting?{config:pending.config}:{})});
      if(receipt.status!=='committed' || receipt.requestId!==pending.requestId || !receipt.current)throw new Error('保存结果尚未确认，请重试原请求');
      apply(receipt.current);state.pending=null;state.conflict=false;state.draft=null;state.active=!receipt.current.deleted;
    }catch(error:any){if(current()){
      if(error?.code==='SCENE_VERSION_CONFLICT'){state.pending=null;state.conflict=true;await refresh();state.error='另一端已修改。你的草稿已保留，请对照最新版本后再次确认。';}
      else {if(error?.status>=400 && error?.status<500 && error?.status!==408 && error?.status!==429)state.pending=null;state.error=error instanceof Error?error.message:'结果未确认，请重试原请求';}
    }}finally{if(current())state.busy=false;}}
  return{current,refresh,edit,add,upload,submit};
}
