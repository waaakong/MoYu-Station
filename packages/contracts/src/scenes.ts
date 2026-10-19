export const privateScenePeriods = ['morning','forenoon','noon','afternoon','dusk','night','midnight'] as const;
export type PrivateScenePeriod = typeof privateScenePeriods[number];
export type PrivateScenePicture = { assetId:string; fit:'cover'|'contain'; focalX:number; focalY:number; zoom:number; dim:number };
export type PrivateSceneConfig = { name:string; defaultImage:PrivateScenePicture; periods:Partial<Record<PrivateScenePeriod,PrivateScenePicture>> };
export type PrivateSceneMedia = { assetId:string; width:number; height:number; clearUrl:string; displayUrl:string; thumbUrl:string; bytes:number };
export type PrivateSceneSnapshot = { version:number; deleted:boolean; config:PrivateSceneConfig|null; media:PrivateSceneMedia[] };
export type PrivateSceneReceipt = { status:'missing'|'committed'; requestId:string; version:number|null; deleted:boolean|null; current:PrivateSceneSnapshot|null };
export type PrivateSceneCommit = { version:number; requestId:string; config:PrivateSceneConfig };
