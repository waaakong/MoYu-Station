import type {ActivityBatch} from '@studyroom/contracts';
export interface SavedActivity {owner:string;batch:ActivityBatch;sealed:boolean}
let database:Promise<IDBDatabase>|undefined;
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('moyu-activity-v2',1);
  request.onupgradeneeded=()=>{const store=request.result.createObjectStore('outbox',{keyPath:'batch.requestId'});store.createIndex('owner','owner');};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=undefined;reject(new Error('活动账本无法保存，请检查本机存储。'));};
});}
export async function readActivity(owner:string):Promise<SavedActivity[]>{
  const database=await db();return new Promise((resolve,reject)=>{const request=database.transaction('outbox').objectStore('outbox').index('owner').getAll(owner);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export async function writeActivity(record:SavedActivity){
  const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('outbox','readwrite');tx.objectStore('outbox').put(structuredClone(record));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export async function deleteActivity(id:string){
  const database=await db();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('outbox','readwrite');tx.objectStore('outbox').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
