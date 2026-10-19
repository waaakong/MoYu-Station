import { entityId, sameEntityId, type EntityId } from "@studyroom/contracts";
import { reactive } from 'vue';
import type { MediaDescriptor,StickerFavorite } from '@studyroom/contracts';
import { MediaApi,type PublicationCommand } from '../media/mediaApi';
import { MediaPublicationTask } from '../media/mediaPublicationTask';
export type PendingSticker={id:string;stickerKey:string;clientMessageId:string;mine:true;senderId:EntityId;receiverId:EntityId|null;channelType:'HALL'|'PRIVATE';messageType:'IMAGE';mediaUrl:string;media:MediaDescriptor;content:string;senderName:string;sendState:'sending'|'unconfirmed'|'failed'};
export const pendingStickers=reactive<PendingSticker[]>([]);
const tasks=new Map<string,MediaPublicationTask>();
export function createStickerSend(api:MediaApi,owner:EntityId,kind:'HALL'|'PRIVATE',recipient:EntityId|null,item:StickerFavorite){
  entityId(owner);if(kind==='PRIVATE')entityId(recipient);
  if(pendingStickers.length>=100)throw new Error('请先处理待确认的表情消息');
  const id=crypto.randomUUID();const command:PublicationCommand={requestId:id,kind,recipient,assets:[item.assetId],content:'',scene:null};
  tasks.set(id,new MediaPublicationTask(api,command));
  pendingStickers.push({id:`sticker-${id}`,stickerKey:id,clientMessageId:`media-${id}`,mine:true,senderId:owner,receiverId:recipient,channelType:kind,messageType:'IMAGE',mediaUrl:item.clearUrl,media:{assetId:item.assetId,purpose:'sticker',width:item.width,height:item.height,thumbnailUrl:item.thumbUrl,clearUrl:item.clearUrl,mime:item.mime,animated:item.mime==='image/gif',posterUrl:item.thumbUrl},content:'',senderName:'我',sendState:'sending'});
  return id;
}
export async function submitSticker(id:string){
  const task=tasks.get(id),item=pendingStickers.find(entry=>entry.stickerKey===id);if(!task || !item)return;
  item.sendState='sending';
  try{await task.submit();if(tasks.get(id)===task)item.sendState='unconfirmed';return task.command;}
  catch(error){if(tasks.get(id)===task)item.sendState=task.snapshot().status==='rejected'?'failed':'unconfirmed';throw error;}
}
export function acknowledgeSticker(message:{clientMessageId?:string;senderId?:EntityId;channelType?:string;receiverId?:EntityId|null}){
  const index=pendingStickers.findIndex(item=>item.clientMessageId===message.clientMessageId && sameEntityId(item.senderId,message.senderId) && item.channelType===message.channelType && (item.channelType==='HALL'?message.receiverId==null:sameEntityId(item.receiverId,message.receiverId)));
  if(index>=0){tasks.delete(pendingStickers[index]!.stickerKey);pendingStickers.splice(index,1);}
}
export function clearStickerOutbox(){for(const task of tasks.values())task.cancel();tasks.clear();pendingStickers.splice(0);}
