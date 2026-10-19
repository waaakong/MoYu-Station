import type { AggregatedTrack, ProviderId, ProviderRuntimeStatus, Track } from "@studyroom/contracts";
import { defineStore } from "pinia";
import { providerErrorText } from './providerLibrary';

export function aggregatedTrackToQueueTrack(track: AggregatedTrack, preferredOrder: ProviderId[]): Track {
  const candidates = [...track.candidates].sort((left, right) => {
    const availability = Number(right.isAvailable) - Number(left.isAvailable);
    return availability || preferredOrder.indexOf(left.providerId) - preferredOrder.indexOf(right.providerId);
  });
  const selected = candidates.find((candidate) => candidate.isAvailable && candidate.rights === "available") ?? candidates[0];
  if (!selected) throw new Error("PROVIDER_UNAVAILABLE");
  return {
    id: track.id,
    title: track.title,
    artist: track.artists.join(" / "),
    album: track.album,
    durationMs: track.durationMs,
    artworkUrl: selected.artworkUrl,
    source: { kind: "provider", providerId: selected.providerId, trackId: selected.trackId },
    providerCandidates: candidates,
    selectedProviderId: selected.providerId
  };
}

export const useProvidersStore = defineStore("providers", {
  state: () => ({
    statuses: [] as ProviderRuntimeStatus[],
    results: [] as AggregatedTrack[],
    directTracks: [] as Track[],
    nextCursor: undefined as string|undefined,
    lastQuery:'',
    lastProvider:undefined as ProviderId|undefined,
    retryMore:false,
    preferredOrder: ["netease", "qq", "kugou"] as ProviderId[],
    loading: false,
    error: "",
    searchEpoch: 0,
    identityEpoch:0,
    statusEpoch:0
  }),
  getters: {
    tracks(state): Track[] { return state.lastProvider==='qq'?state.directTracks:state.results.map((track) => aggregatedTrackToQueueTrack(track, state.preferredOrder)); }
  },
  actions: {
    clearResults(){this.searchEpoch++;this.results=[];this.directTracks=[];this.nextCursor=undefined;this.lastQuery='';this.lastProvider=undefined;this.retryMore=false;this.loading=false;this.error="";},
    invalidateIdentity(){this.identityEpoch++;this.statusEpoch++;this.clearResults();},
    acceptStatus(status:ProviderRuntimeStatus){
      this.statusEpoch++;
      this.statuses=[...this.statuses.filter(item=>item.providerId!==status.providerId),status];
      if(status.state==='expired')this.invalidateIdentity();
    },
    async loadStatuses() {
      const epoch=++this.statusEpoch;
      const statuses=window.studyRoomDesktop ? await window.studyRoomDesktop.listProviderStatuses() : [];
      if(epoch===this.statusEpoch)this.statuses=statuses;
    },
    async acceptRisk() {
      if (!window.studyRoomDesktop) return;
      const epoch=++this.statusEpoch;
      const statuses=await window.studyRoomDesktop.setProviderConsent({ version: 1, accepted: true });
      if(epoch===this.statusEpoch)this.statuses=statuses;
    },
    async search(query: string, providerId?: ProviderId,more=false) {
      if (!window.studyRoomDesktop) throw new Error("桌面客户端专属实验能力");
      if(more&&(this.loading||!this.nextCursor||query!==this.lastQuery||providerId!==this.lastProvider))return;
      const cursor=more?this.nextCursor:undefined;
      const epoch = ++this.searchEpoch;
      if(!more){this.results=[];this.directTracks=[];this.nextCursor=undefined;}
      this.lastQuery=query;this.lastProvider=providerId;this.retryMore=more;
      this.loading = true;
      this.error = "";
      try {
        if(providerId==='qq'){
          const page=await window.studyRoomDesktop.searchProviderTracks({providerId,query,cursor,pageSize:30});
          if(epoch!==this.searchEpoch)return;
          if(page.providerId!==providerId||page.items.some(t=>t.source.kind!=='provider'||t.source.providerId!==providerId))throw new Error('PROVIDER_API_CHANGED');
          this.directTracks=[...new Map([...(more?this.directTracks:[]),...page.items].map(t=>[t.id,t])).values()];
          this.nextCursor=page.nextCursor===cursor?undefined:page.nextCursor;this.retryMore=false;return;
        }
        const result = await window.studyRoomDesktop.searchAggregatedTracks({ query, providers: providerId ? [providerId] : undefined, pageSize: 30 });
        if (epoch !== this.searchEpoch) return;
        this.results = result.items;
        if (!result.items.length && Object.keys(result.failedProviders).length) this.error = "当前平台不可用，已保持关闭";
      } catch (error) {
        if (epoch !== this.searchEpoch) return;
        if(!more||/SESSION_EXPIRED|LOGIN_REQUIRED/.test(error instanceof Error?`${error.name} ${error.message}`:'')){this.results=[];this.directTracks=[];this.nextCursor=undefined;}
        this.error = providerErrorText(error);
      } finally { if (epoch === this.searchEpoch) this.loading = false; }
    },
    async loadMore(){await this.search(this.lastQuery,this.lastProvider,true);},
    async retrySearch(){await this.search(this.lastQuery,this.lastProvider,this.retryMore&&!!this.nextCursor);},
    async setOrder(order: ProviderId[]) {
      if (!window.studyRoomDesktop) return;
      this.preferredOrder = await window.studyRoomDesktop.setPreferredProviderOrder({ providerIds: order });
    }
  }
});
