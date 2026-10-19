<template>
  <section class="profiles-panel" aria-label="声音快照与输出">
    <div class="profiles-panel__title"><div><strong>声音快照</strong><small>保存当前混音与显示设置</small></div><span>{{ sound.snapshots.length }} / 20</span></div>
    <form class="profiles-panel__form" @submit.prevent="save"><input v-model.trim="name" maxlength="60" aria-label="声音快照名称" placeholder="例如：深夜阅读" /><button type="submit" :disabled="!name || sound.snapshots.length >= 20">保存</button></form>
    <div v-if="sound.snapshots.length" class="profiles-panel__list">
      <div v-for="snapshot in sound.snapshots" :key="snapshot.id"><button type="button" @click="sound.applySnapshot(snapshot.id)">{{ snapshot.name }}</button><button type="button" :aria-label="`删除声音快照 ${snapshot.name}`" @click="remove(snapshot.id)"><AppIcon name="close" /></button></div>
    </div>
    <label v-if="sound.outputSupported" class="profiles-panel__output">输出设备<AppSelect :value="sound.settings.outputDeviceId || 'default'" @change="selectOutput"><option value="default">系统默认</option><option v-for="device in sound.outputDevices.filter(({ id }) => id !== 'default')" :key="device.id" :value="device.id">{{ device.label }}</option></AppSelect></label>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useShellStore } from "../../stores/shell";
import { useSoundStore } from "../../stores/sound";
const sound = useSoundStore();
const shell = useShellStore();
const name = ref("");
async function save() { try { await sound.saveSnapshot(name.value); name.value = ""; shell.toast("声音快照已保存", "success"); } catch { shell.toast("声音快照没有保存，请检查名称或数量", "error"); } }
async function remove(snapshotId: string) { try { await sound.deleteSnapshot(snapshotId); } catch { shell.toast("无法删除声音快照", "error"); } }
async function selectOutput(event: Event) { try { await sound.selectOutputDevice((event.target as HTMLSelectElement).value); } catch { shell.toast("输出设备切换失败，已回到系统默认", "error"); } }
</script>

<style scoped>
.profiles-panel{display:grid;gap:9px;padding-top:15px;border-top:1px solid var(--sr-color-line)}.profiles-panel__title{display:flex;align-items:center;justify-content:space-between}.profiles-panel__title>div{display:flex;flex-direction:column;gap:2px}.profiles-panel__title strong{font-size:11px}.profiles-panel__title small,.profiles-panel__title>span{color:var(--sr-color-text-faint);font-size:11px}.profiles-panel__form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px}.profiles-panel input,.profiles-panel select{min-width:0;padding:7px 8px;border:1px solid var(--sr-color-line);border-radius:8px;background:var(--sr-color-surface-solid);color:var(--sr-color-text-muted);font-size:11px}.profiles-panel button{padding:6px 8px;border:0;border-radius:7px;background:var(--sr-color-surface-raised);color:var(--sr-color-text-muted);font-size:11px;cursor:pointer}.profiles-panel__list{display:grid;gap:3px}.profiles-panel__list>div{display:grid;grid-template-columns:minmax(0,1fr) 22px}.profiles-panel__list button:first-child{overflow:hidden;text-align:left;text-overflow:ellipsis;white-space:nowrap}.profiles-panel__output{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px;color:var(--sr-color-text-muted);font-size:11px}
.profiles-panel button,.profiles-panel input,.profiles-panel select{min-height:44px;border-radius:10px;font-size:12px}.profiles-panel__list>div{grid-template-columns:minmax(0,1fr) 44px}.profiles-panel__output{grid-template-columns:1fr}.profiles-panel__title strong{font-size:14px}
</style>
