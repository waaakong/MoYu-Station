<template>
  <div class="private-scene-entry">
    <button class="private-scene-entry__button" type="button" aria-label="自定义场景" aria-haspopup="dialog" @click="open"><span aria-hidden="true">＋</span> 自定义场景</button>
    <label v-if="state.saved?.config && sameEntityId(state.owner,auth.user?.id)"><input v-model="state.active" type="checkbox" /> 使用私人场景</label>
    <Teleport to="body">
      <dialog ref="dialog" class="private-scene-editor sr-glass sr-glass--floating" aria-labelledby="private-scene-title" @close="opened=false">
        <header><div><small>只属于你的空间 · 账号同步</small><h2 id="private-scene-title">自定义分时窗景</h2></div><button type="button" autofocus aria-label="关闭场景编辑器" @click="closeMotionDialog(dialog)">关闭</button></header>
        <section v-if="!auth.isLoggedIn" class="scene-entry-state">
          <h3>登录，保存你的窗景</h3>
          <p>登录墨屿后，可上传默认图和七个时段的图片，保存到你的私人空间。内置场景无需登录。</p>
          <button type="button" @click="login">登录墨屿</button>
        </section>
        <section v-else-if="!state.enabled" class="scene-entry-state">
          <p :role="state.error?'alert':'status'">{{ state.loading?'正在检查场景服务…':state.error||'当前服务未启用私人场景。不会回退到公开上传。' }}</p>
          <button type="button" :disabled="state.loading" @click="refreshEditor">重新检查</button>
        </section>
        <template v-else>
          <p class="hint">无需裁成 16∶9。未配置的时段使用默认图。云端保存只同步配置；本设备的使用开关和时间模式保持独立。</p>
          <p class="hint">已保存的图片会尝试缓存到本机，仅供当前账号使用；离线时不能上传或提交修改。缓存失败不会撤销云端保存。</p>
          <p v-if="state.cacheError" role="status">{{ state.cacheError }}</p>
          <label>场景名称 <input v-if="state.draft" v-model="state.draft.name" maxlength="40" :disabled="locked" /><span v-else>上传默认图后编辑名称</span></label>
          <nav aria-label="私人场景时段"><button v-for="item in slots" :key="item.key" type="button" :aria-pressed="slot===item.key" @click="slot=item.key">{{ item.name }}{{ pictureFor(item.key)?' ·':'' }}</button></nav>
          <div class="scene-edit-body">
            <div class="scene-preview" :style="{background:'#14201c'}">
              <img v-if="preview && picture?.fit==='contain'" class="blur-fill" :src="preview" alt="" />
              <img v-if="preview && picture" class="main-preview" :src="preview" alt="当前时段场景预览" :style="pictureStyle" />
              <span v-else>{{ slot==='default'?'上传一张默认图':'此时段未配置，使用默认图' }}</span>
              <i v-if="picture" :style="{background:`rgba(0,0,0,${picture.dim})`}"></i>
            </div>
            <div class="scene-adjustments">
              <label class="upload-control">{{ slot==='default'?'选择默认图':'选择时段图' }}<input type="file" accept="image/jpeg,image/png,image/webp" :disabled="locked || slot!=='default' && !state.draft" @change="choose" /></label>
              <template v-if="picture">
                <label>显示方式<AppSelect v-model="picture.fit" :disabled="locked"><option value="cover">铺满场景</option><option value="contain">完整显示＋模糊补边</option></AppSelect></label>
                <label>水平焦点<input v-model.number="picture.focalX" :disabled="locked" type="range" min="0" max="1" step=".01" /></label>
                <label>垂直焦点<input v-model.number="picture.focalY" :disabled="locked" type="range" min="0" max="1" step=".01" /></label>
                <label>缩放 {{ picture.zoom.toFixed(2) }}×<input v-model.number="picture.zoom" :disabled="locked || picture.fit==='contain'" type="range" min="1" max="3" step=".01" /></label>
                <label>压暗 {{ Math.round(picture.dim*100) }}%<input v-model.number="picture.dim" :disabled="locked" type="range" min="0" max=".8" step=".01" /></label>
                <button v-if="slot!=='default'" type="button" :disabled="locked" @click="removePeriod">移除此时段，使用默认图</button>
              </template>
            </div>
          </div>
          <ul v-if="state.uploads.length" aria-label="场景上传任务"><li v-for="job in state.uploads" :key="job.id">{{ slots.find(item=>item.key===job.slot)?.name }}：{{ job.busy?'处理中…':job.error }} <button type="button" :disabled="job.busy" @click="api.upload(job)">重试原任务</button><button type="button" @click="state.uploads=state.uploads.filter(item=>item.id!==job.id)">移除</button></li></ul>
          <p v-if="state.error" role="alert">{{ state.error }}</p>
          <p v-if="state.pending" role="status">保存结果未确认。配置暂时锁定；重试会先查询原请求，不重复创建。</p>
          <p v-if="state.conflict">最新云端版本：{{ state.saved?.version }}。再次保存将提交保留的草稿，需你重新确认。</p>
          <footer>
            <button type="button" :disabled="state.busy || state.uploads.length>0 || !state.draft && !state.pending" @click="save">{{ state.busy?'正在确认…':state.pending?'查询并重试原请求':state.conflict?'确认以草稿更新最新版本':'保存并使用' }}</button>
            <button type="button" :disabled="locked || state.uploads.length>0 || !state.saved?.config" @click="confirmDelete=true">删除云端配置</button>
            <button v-if="confirmDelete" type="button" :disabled="locked" @click="confirmDelete=false;api.submit(true)">确认删除当前版本</button>
          </footer>
        </template>
      </dialog>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import { openMotionDialog, closeMotionDialog } from '../../motion/runtime';
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import {useRouter} from 'vue-router';
import {sameEntityId} from '@studyroom/contracts';
import {useAuthStore} from '../../stores/auth';
import {timePoints} from '../../data/scenes';
import {privateScene as state,type SceneSlot} from '../../scenes/privateSession';
import {privateSceneApi} from '../../scenes/privateApi';
import {cloudMediaUrl} from '../../utils/cloudMedia';
const auth=useAuthStore(),router=useRouter(),dialog=ref<HTMLDialogElement>(),opened=ref(false),slot=ref<SceneSlot>('default'),confirmDelete=ref(false);
const api=computed(()=>{auth.user?.id;auth.sessionGeneration;return privateSceneApi();});
const locked=computed(()=>state.busy || !!state.pending);
const slots=[{key:'default' as SceneSlot,name:'默认图'},...timePoints.map(item=>({key:item.key as SceneSlot,name:item.name}))];
const pictureFor=(key:SceneSlot)=>key==='default'?state.draft?.defaultImage:state.draft?.periods[key];
const picture=computed(()=>pictureFor(slot.value));
const preview=computed(()=>picture.value?state.cachedUrls[picture.value.assetId]||cloudMediaUrl(`/api/media/assets/${picture.value.assetId}/display`):'');
const pictureStyle=computed(()=>picture.value?{objectFit:picture.value.fit,objectPosition:`${picture.value.focalX*100}% ${picture.value.focalY*100}%`,transform:`scale(${picture.value.fit==='contain'?1:picture.value.zoom})`}:{});
async function refreshEditor(){await api.value.refresh();if(opened.value)api.value.edit();}
async function open(){opened.value=true;openMotionDialog(dialog.value);if(dialog.value)dialog.value.scrollTop=0;await refreshEditor();}
function login(){closeMotionDialog(dialog.value);void router.push({name:'login',query:{redirect:'/scene'}});}
async function save(){await api.value.submit();if(!state.error && !state.pending && state.active && !state.draft)closeMotionDialog(dialog.value);}
function choose(event:Event){const input=event.target as HTMLInputElement;if(input.files?.[0])api.value.add(input.files[0],slot.value);input.value='';}
function removePeriod(){if(state.draft && slot.value!=='default')delete state.draft.periods[slot.value];}
watch(()=>auth.sessionGeneration,()=>{closeMotionDialog(dialog.value, true);confirmDelete.value=false;slot.value='default';});
onBeforeUnmount(()=>closeMotionDialog(dialog.value, true));
</script>
<style scoped>
.private-scene-entry{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.private-scene-entry>label{font-size:12px}.private-scene-editor{width:min(900px,calc(100vw - 48px));max-height:calc(100dvh - 72px);overflow:auto;border:1px solid var(--sr-color-line-strong);background:var(--sr-color-surface-solid);color:var(--sr-color-text);padding:24px;border-radius:22px;box-sizing:border-box}.private-scene-editor::backdrop{background:rgba(7,12,20,.8);backdrop-filter:blur(8px)}header,footer{display:flex;gap:12px;justify-content:space-between;align-items:center}h2{margin:8px 0}small,.hint{color:var(--sr-color-text-muted)}.hint{font-size:13px;line-height:1.7}nav{display:flex;flex-wrap:wrap;gap:6px;margin:18px 0}button,select,input:not([type=range]):not([type=checkbox]){min-height:40px;color:inherit;background:#ffffff0d;border:1px solid var(--sr-color-line-strong);border-radius:9px;padding:6px 10px;font:inherit;box-sizing:border-box}button{cursor:pointer}button[aria-pressed=true]{background:var(--sr-color-selected)}button:disabled{opacity:.5;cursor:default}option{background:var(--sr-color-surface-solid)}.scene-edit-body{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:20px}.scene-preview{position:relative;aspect-ratio:16/9;overflow:hidden;display:grid;place-items:center;border-radius:12px}.scene-preview img,.scene-preview i{position:absolute;width:100%;height:100%;inset:0}.blur-fill{object-fit:cover;filter:blur(24px);transform:scale(1.15);opacity:.6}.scene-adjustments{display:grid;gap:10px}.scene-adjustments label{display:grid;gap:5px;font-size:13px}.upload-control input{max-width:100%;font-size:12px}input[type=range]{width:100%;accent-color:var(--sr-color-accent)}footer{margin-top:20px;flex-wrap:wrap}ul{padding-left:20px;line-height:2}p[role=alert]{color:#ffd8ae}.sr-reduced-transparency .private-scene-editor::backdrop{backdrop-filter:none;background:rgba(7,12,20,.95)}@media(max-width:600px){.private-scene-editor{margin:0;width:100%;height:100dvh;max-height:100dvh;border-radius:0;padding:20px}.scene-edit-body{grid-template-columns:1fr}.scene-preview{aspect-ratio:4/3}header{align-items:flex-start}footer button{flex:1;min-width:140px}}
.private-scene-entry{margin-top:12px;padding-top:12px;border-top:1px solid var(--sr-color-line)}button,select,input:not([type=range]):not([type=checkbox]){min-height:44px;border-radius:var(--sr-radius-control,12px);font-size:13px}.private-scene-editor{border-color:var(--sr-color-line-strong);background:var(--sr-color-surface-solid);box-shadow:0 24px 80px #030a0655}.scene-adjustments{gap:14px}.scene-adjustments label{gap:8px}.scene-adjustments input[type=range]{min-height:28px}.private-scene-editor button:focus-visible,.private-scene-editor select:focus-visible,.private-scene-editor input:focus-visible{outline:2px solid var(--sr-color-focus,#b6d7bd);outline-offset:3px}.private-scene-editor footer{padding-top:16px;border-top:1px solid var(--sr-color-line)}.private-scene-editor h2{font-size:22px;font-weight:600}.private-scene-editor nav{padding:4px;background:rgba(12,18,28,.36);border-radius:14px}.private-scene-editor nav button{border-color:transparent}.private-scene-editor nav button[aria-pressed=true]{background:var(--sr-color-selected,#d0e7d524);border-color:var(--sr-color-line-strong)}
.private-scene-entry{margin:0;padding:0;border:0;flex:0 0 auto;max-width:55%;flex-direction:column;align-items:flex-end;gap:6px}
.private-scene-entry__button{white-space:nowrap;min-height:44px;background:var(--sr-color-selected,#ffffff15);border-color:var(--sr-color-line-strong)}
.private-scene-entry>label{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--sr-color-text-muted)}
.private-scene-entry__button:focus-visible{outline:2px solid var(--sr-color-focus,#b6d7bd);outline-offset:3px}
</style>
