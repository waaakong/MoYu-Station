<template>
  <section class="provider-library" aria-label="平台音乐库">
    <nav class="provider-library__tabs" aria-label="平台音乐分类">
      <button v-for="tab in tabs" :key="tab.id" type="button" :aria-pressed="library.view===tab.id || tab.id==='playlists'&&library.view==='playlist'" @click="library.open(tab.id)">{{ tab.label }}</button>
    </nav>
    <form v-if="library.view==='search' && auth.isLoggedIn && !auth.isBanned && (!providerId || signedIn)" class="provider-library__search" @submit.prevent="search">
      <input v-model.trim="query" type="search" maxlength="120" placeholder="搜索歌曲或艺术家" aria-label="搜索平台音乐" />
      <button type="submit" :disabled="!query || providers.loading">{{providers.loading?'搜索中…':'搜索'}}</button>
    </form>
    <p v-if="providerId==='qq'" class="provider-library__error">登录 QQ 后可搜索并加载更多结果、查看歌单与收藏；仅播放平台允许的完整免费曲目，暂不支持微信登录。</p>
    <p v-else-if="providerId==='kugou' && status?.supportsLogin!==false" class="provider-library__error">{{status?.capabilities.includes('playback')?'歌单、收藏和播放需官方账号登录；仅播放平台明确允许的完整免费曲目，不播放会员或试听音源。旧会话如提示需登录，请重新扫码。':'已接入官方账号登录与本机加密会话；目前仅提供公开搜索，歌单、收藏和播放尚未开启。'}}</p>
    <p v-else-if="status?.supportsLogin===false" class="provider-library__error">当前仅支持公开搜索，播放仍需完成官方验证适配。歌单、收藏与账号登录尚未接入。</p>
    <div v-if="library.view==='playlist'" class="provider-library__heading"><button type="button" @click="library.open('playlists')">返回歌单</button><h3>{{library.playlist?.name}}</h3></div>
    <ProviderLoginPrompt v-if="!auth.isLoggedIn || auth.isBanned" stage="moyu" @login="router.push('/login')" />
    <StatePanel v-else-if="requiresAccount&&!status?.enabled" title="当前平台尚未启用" description="请查看平台状态并确认非官方接入说明。" action-label="查看平台状态" @action="$emit('accounts')" />
    <ProviderLoginPrompt v-else-if="requiresAccount&&!signedIn" stage="provider" @login="$emit('accounts')" />
    <template v-else>
      <p v-if="error" class="provider-library__error" role="alert">{{error}} <button type="button" @click="retry">重试</button><button type="button" @click="$emit('accounts')">平台状态</button></p>
      <AppSkeleton v-if="busy&&!items.length" :lines="4" />
      <div v-else-if="library.view==='playlists'&&library.playlists.length" class="provider-library__playlists" role="list" aria-label="平台歌单">
        <div v-for="item in library.playlists" :key="item.id" role="listitem"><button type="button" @click="library.open('playlist',item)"><span class="provider-library__cover"><TrackArtwork :playlist="item" :provider-id="item.providerId" :src="item.artworkToken ? `studyroom-media://provider-artwork/${item.artworkToken}` : undefined" /></span><span class="provider-library__playlist-copy"><strong>{{item.name}}</strong><small>{{item.trackCount==null?'曲目数量未知':`${item.trackCount} 首`}}</small></span><span aria-hidden="true">→</span></button></div>
      </div>
      <VirtualTrackList v-else-if="tracks.length" :tracks="tracks" :allow-library-actions="false" @play="track=>$emit('play',track)" @play-next="track=>$emit('play-next',track)" @select-provider-source="(track,id)=>$emit('select-provider-source',track,id)" />
      <StatePanel v-else-if="!busy&&!error" :title="emptyTitle" :description="library.view==='search'?'输入关键词查询当前平台，不自动换源。':'平台返回的列表为空。这里只读浏览，不会修改你的歌单或收藏。'" />
      <button v-if="library.view!=='search'&&library.nextCursor" class="provider-library__more" type="button" :disabled="busy" @click="library.load(true)">{{busy?'加载中…':'加载更多'}}</button>
      <button v-if="library.view==='search'&&providers.nextCursor" class="provider-library__more" type="button" :disabled="busy" @click="providers.loadMore()">{{busy?'加载中…':'加载更多搜索结果'}}</button>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed,onBeforeUnmount,ref,watch } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useRouter } from 'vue-router';
const auth = useAuthStore(), router = useRouter();
import type {ProviderId,Track} from '@studyroom/contracts';
import {useProvidersStore} from '../../stores/providers';
import {useProviderLibraryStore,type ProviderLibraryView} from '../../stores/providerLibrary';
import TrackArtwork from '../../components/sound/TrackArtwork.vue';
import ProviderLoginPrompt from './ProviderLoginPrompt.vue';
import VirtualTrackList from '../../components/sound/VirtualTrackList.vue';
import StatePanel from '../../components/states/StatePanel.vue';
import AppSkeleton from '../../components/states/AppSkeleton.vue';
const props=defineProps<{source:string}>();
defineEmits<{(event:'accounts'):void;(event:'play',track:Track):void;(event:'play-next',track:Track):void;(event:'select-provider-source',track:Track,id:ProviderId):void}>();
const providers=useProvidersStore(),library=useProviderLibraryStore(),query=ref(''),searched=ref(false);
const providerId=computed(()=>props.source==='provider:all'?undefined:props.source.slice(9) as ProviderId);
const status=computed(()=>providers.statuses.find(s=>s.providerId===providerId.value));
const signedIn=computed(()=>status.value?.enabled&&status.value.state==='signed-in');
const requiresAccount=computed(()=>!!providerId.value);
const tabs=computed(()=>[
  {id:'search' as ProviderLibraryView,label:'搜索'},
  ...(providerId.value&&status.value?.capabilities.includes('playlists')?[{id:'playlists' as ProviderLibraryView,label:'我的歌单'}]:[]),
  ...(providerId.value&&status.value?.capabilities.includes('favorites')?[{id:'favorites' as ProviderLibraryView,label:'我喜欢的'}]:[])
]);
const tracks=computed(()=>library.view==='search'?providers.tracks:library.tracks);
const items=computed(()=>library.view==='playlists'?library.playlists:tracks.value);
const busy=computed(()=>library.view==='search'?providers.loading:library.loading);
const error=computed(()=>library.view==='search'?providers.error:library.error);
const emptyTitle=computed(()=>library.view==='search'?(searched.value?'没有找到匹配曲目':'搜索平台音乐'):library.view==='playlists'?'还没有歌单':'还没有曲目');
async function search(){if(!query.value || !auth.isLoggedIn || auth.isBanned || providerId.value && !signedIn.value)return;searched.value=true;await providers.search(query.value,providerId.value);}
function retry(){if(library.view==='search')void providers.retrySearch();else void library.load(Boolean(library.nextCursor));}
watch(()=>props.source,()=>{library.reset(providerId.value);providers.clearResults();query.value='';searched.value=false;},{immediate:true,flush:'sync'});
watch(()=>providers.identityEpoch,()=>library.reset(providerId.value),{flush:'sync'});
watch(signedIn,(value,old)=>{if(old&&!value)library.reset(providerId.value);});
onBeforeUnmount(()=>{library.reset();providers.clearResults();});
</script>
<style scoped>
.provider-library{display:flex;flex-direction:column;gap:16px;min-height:0;flex:1}.provider-library__tabs{display:flex;gap:6px;flex-wrap:wrap}.provider-library button{min-height:44px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-control,12px);padding:8px 14px;background:var(--sr-color-surface-raised);color:var(--sr-color-text);cursor:pointer}.provider-library button[aria-pressed=true]{background:var(--sr-color-accent);color:var(--sr-color-accent-ink);border-color:transparent}.provider-library button:disabled{opacity:.5;cursor:default}.provider-library__search{display:flex;gap:8px}.provider-library__search input{flex:1;min-width:0;min-height:44px;box-sizing:border-box;border:1px solid var(--sr-color-line);border-radius:12px;background:var(--sr-color-surface-raised);color:var(--sr-color-text);padding:10px 12px}.provider-library__playlists{display:grid;gap:8px;overflow:auto;min-height:0}.provider-library__playlists button{display:flex;gap:14px;align-items:center;text-align:left;padding:14px}.provider-library__playlists .provider-library__playlist-copy{display:grid;gap:5px;flex:1;min-width:0}.provider-library__playlists strong{overflow-wrap:anywhere}.provider-library__playlists small{color:var(--sr-color-text-muted)}.provider-library__heading{display:flex;align-items:center;gap:14px}.provider-library__heading h3{font-size:16px;margin:0;overflow-wrap:anywhere}.provider-library__error{font-size:13px;color:var(--sr-color-text-muted);line-height:1.6}.provider-library__error button{margin-left:8px}.provider-library__more{align-self:center;flex-shrink:0}
.provider-library { flex: 1 0 auto; gap: 12px; }
.provider-library__playlists button { width: 100%; }
.provider-library__cover{width:48px;height:48px;flex:0 0 48px;border-radius:10px;background:var(--sr-color-surface-raised)}
/* Keep complete rows reachable at short window heights; the parent pane scrolls. */
.provider-library :deep(.virtual-track-list) { flex: 0 0 auto; height: clamp(174px, calc(100dvh - 460px), 420px); }
@media (min-width: 701px) and (max-height: 760px) {
  .provider-library :deep(.state-panel) { max-width: none; padding: 14px; gap: 6px 16px; grid-template-columns: minmax(0, 1fr) auto; }
  .provider-library :deep(.state-panel__mark) { display: none; }
  .provider-library :deep(.state-panel h2) { grid-column: 1; margin: 0; font: 600 18px/1.4 var(--sr-font-sans); }
  .provider-library :deep(.state-panel p) { grid-column: 1; font-size: 12px; }
  .provider-library :deep(.state-panel button) { grid-column: 2; grid-row: 1 / 3; margin: 0; align-self: center; }
}
</style>
