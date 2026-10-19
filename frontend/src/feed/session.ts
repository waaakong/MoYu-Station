import { reactive } from 'vue';

export type FeedStream = 'square' | 'following';
export interface FeedPageState { ids:(string|number)[]; cursor:string|null; loaded:boolean; more:boolean; loading:boolean; error:string; anchor:{id:string|number;offset:number;top:number}|null; request:number; stale:boolean }
const page = ():FeedPageState => ({ids:[],cursor:null,loaded:false,more:true,loading:false,error:'',anchor:null,request:0,stale:false});
const draft = () => ({content:'',sceneCode:'default',clientRequestId:crypto.randomUUID().replaceAll('-',''),images:[] as File[]});
export const feedSession = reactive({
  stream:'square' as FeedStream, pages:{square:page(),following:page()}, entities:{} as Record<string,any>,
  removed:new Set<string|number>(),entityRevision:{} as Record<string,number>,
  following:{} as Record<string,boolean>, relationshipVersion:0, relationEpoch:0,
  draft:draft(), publishing:false, error:'', textUnknown:false, textPayload:null as null|{content:string;sceneCode:string;clientRequestId:string},
  comments:{} as Record<string,any[]>, commentDrafts:{} as Record<string,string>, replyTargets:{} as Record<string,any>
});
export function clearFeedSession(){
  Object.assign(feedSession.draft,draft());
  for(const record of [feedSession.comments,feedSession.commentDrafts,feedSession.replyTargets])for(const key of Object.keys(record))delete record[key];
  Object.assign(feedSession,{stream:'square',pages:{square:page(),following:page()},entities:{},removed:new Set<string|number>(),entityRevision:{},following:{},relationshipVersion:0,relationEpoch:feedSession.relationEpoch+1,
    publishing:false,error:'',textUnknown:false,textPayload:null});
}
export function touchFeedEntity(id:string|number){feedSession.entityRevision[id]=(feedSession.entityRevision[id]||0)+1;}
export function mergeFeedEntities(items:any[],expected?:Record<string,number>){for(const item of items){
  if(feedSession.removed.has(item.id) || expected && (expected[item.id]||0)!==(feedSession.entityRevision[item.id]||0))continue;
  const previous=feedSession.entities[item.id];if(previous)Object.assign(previous,item);else feedSession.entities[item.id]=item;touchFeedEntity(item.id);
}}
export function removeFeedEntity(id:string|number){feedSession.removed.add(id);touchFeedEntity(id);delete feedSession.entities[id];for(const state of Object.values(feedSession.pages))state.ids=state.ids.filter(value=>value!==id);}
