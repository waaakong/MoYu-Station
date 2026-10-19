import { reactive } from 'vue';
import type { StickerCollection } from '@studyroom/contracts';
export type FavoriteJob={id:string;uploadId:string;file?:File;assetId?:string;messageId?:string;state:'working'|'unknown'|'failed';error:string};
export const stickerSession=reactive({collection:{version:0,items:[]} as StickerCollection,enabled:false,loading:false,error:'',jobs:[] as FavoriteJob[],orderIntent:null as string[]|null,orderVersion:0,orderConflict:false});
const controllers=new Set<AbortController>();
export function stickerController(){const controller=new AbortController();controllers.add(controller);return {controller,release:()=>controllers.delete(controller)};}
export function clearStickerSession(){for(const controller of controllers)controller.abort();controllers.clear();stickerSession.collection={version:0,items:[]};stickerSession.enabled=false;stickerSession.loading=false;stickerSession.error='';stickerSession.jobs=[];stickerSession.orderIntent=null;stickerSession.orderConflict=false;}
