import {reactive} from 'vue';
import type {PrivateSceneConfig,PrivateSceneSnapshot,PrivateScenePeriod} from '@studyroom/contracts';
export type SceneSlot='default'|PrivateScenePeriod;
export type SceneUpload={id:string;slot:SceneSlot;file:File;busy:boolean;error:string};
export type ScenePending={version:number;requestId:string;config?:PrivateSceneConfig;deleting:boolean};
export const privateScene=reactive({owner:'',enabled:false,active:false,loading:false,busy:false,error:'',
  cachedUrls:{} as Record<string,string>,cacheError:'',
  saved:null as PrivateSceneSnapshot|null,draft:null as PrivateSceneConfig|null,draftVersion:0,
  uploads:[] as SceneUpload[],pending:null as ScenePending|null,conflict:false});
const controllers=new Set<AbortController>();
const clearListeners=new Set<()=>void>();
export function onPrivateSceneClear(listener:()=>void){clearListeners.add(listener);return()=>{clearListeners.delete(listener);};}
export function privateSceneController(){const controller=new AbortController();controllers.add(controller);return{controller,release:()=>controllers.delete(controller)};}
export function clearPrivateScene(){
  for(const controller of controllers)controller.abort();controllers.clear();
  for(const listener of clearListeners)listener();
  // Hide immediately; asynchronous disk cleanup failure must not restore private content.
  stateReset();
}
function stateReset(){
  privateScene.cachedUrls={};
  Object.assign(privateScene,{owner:'',enabled:false,active:false,loading:false,busy:false,error:'',saved:null,draft:null,draftVersion:0,uploads:[],pending:null,conflict:false});
}
