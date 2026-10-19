import { defineStore } from "pinia";
import type { ProviderId, ProviderPlaylistSummary, Track } from "@studyroom/contracts";

export type ProviderLibraryView = "search" | "playlists" | "favorites" | "playlist";
export const useProviderLibraryStore=defineStore("provider-library",{
  state:()=>({providerId:undefined as ProviderId|undefined,view:"search" as ProviderLibraryView,playlist:undefined as ProviderPlaylistSummary|undefined,
    playlists:[] as ProviderPlaylistSummary[],tracks:[] as Track[],nextCursor:undefined as string|undefined,loading:false,error:"",epoch:0}),
  actions:{
    reset(providerId?:ProviderId){this.epoch++;this.providerId=providerId;this.view="search";this.playlist=undefined;this.playlists=[];this.tracks=[];this.nextCursor=undefined;this.loading=false;this.error="";},
    async open(view:ProviderLibraryView,playlist?:ProviderPlaylistSummary){
      this.epoch++;this.view=view;this.playlist=playlist;this.playlists=[];this.tracks=[];this.nextCursor=undefined;this.error="";this.loading=false;
      if(view!=="search")await this.load();
    },
    async load(more=false){
      const bridge=window.studyRoomDesktop,providerId=this.providerId;
      if(!bridge||!providerId||this.view==="search"||this.loading||(more&&!this.nextCursor))return;
      const epoch=this.epoch,view=this.view,cursor=more?this.nextCursor:undefined,playlist=this.playlist;
      this.loading=true;this.error="";
      try{
        const input={providerId,cursor,pageSize:30};
        if(view==="playlists"){
          const page=await bridge.listProviderPlaylists(input);if(epoch!==this.epoch)return;
          if(page.providerId!==providerId)throw new Error("PROVIDER_API_CHANGED");
          this.playlists=[...new Map([...(more?this.playlists:[]),...page.items].map(item=>[item.id,item])).values()];
          this.nextCursor=page.nextCursor===cursor?undefined:page.nextCursor;
        }else{
          if(view==="playlist"&&!playlist)throw new Error("PROVIDER_UNAVAILABLE");
          const page=view==="favorites"?await bridge.listProviderFavorites(input):await bridge.listProviderPlaylistTracks({...input,playlistId:playlist!.id});
          if(epoch!==this.epoch)return;
          if(page.providerId!==providerId)throw new Error("PROVIDER_API_CHANGED");
          this.tracks=[...new Map([...(more?this.tracks:[]),...page.items].map(item=>[item.id,item])).values()];
          this.nextCursor=page.nextCursor===cursor?undefined:page.nextCursor;
        }
      }catch(error){if(epoch===this.epoch){
        if(/LOGIN_REQUIRED|SESSION_EXPIRED/.test(providerErrorCode(error))){this.playlists=[];this.tracks=[];this.nextCursor=undefined;this.playlist=undefined;}
        this.error=providerErrorText(error);
      }}
      finally{if(epoch===this.epoch)this.loading=false;}
    }
  }
});
export function providerErrorText(error:unknown):string{
  const code=providerErrorCode(error);
  if(/PROVIDER_APP_LOGIN_REQUIRED/.test(code))return "请先登录墨屿账号，再登录对应音乐平台。";
  if(/LOGIN_REQUIRED|SESSION_EXPIRED/.test(code))return "登录已失效，请在平台官方窗口重新登录。";
  if(/RIGHTS_RESTRICTED|REGION_RESTRICTED/.test(code))return "当前账号或地区无权播放此曲目。";
  if(/TIMEOUT/.test(code))return "平台响应超时，可手动重试。";
  if(/RATE_LIMITED|CIRCUIT_OPEN/.test(code))return "平台暂时限制请求，请稍后再试。";
  if(/API_CHANGED/.test(code))return "平台接口发生变化，当前能力暂不可用。";
  if(/AbortError|cancelled|canceled|Aborted/.test(code))return "已取消登录。";
  return "平台暂时不可用，请稍后重试；没有更改平台数据。";
}
function providerErrorCode(error:unknown):string{
  // Electron's preload preserves the stable IPC code in Error.name, with translated copy in message.
  return error instanceof Error?`${error.name} ${error.message}`:String(error);
}
