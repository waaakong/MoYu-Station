<template>
  <aside class="provider-accounts sr-glass sr-glass--floating" aria-label="平台音乐内容">
    <header><div><small>MUSIC ACCOUNTS</small><h2>平台音乐</h2></div><button type="button" aria-label="关闭平台音乐" @click="$emit('close')"><AppIcon name="close" /></button></header>
    <p class="provider-accounts__notice">非网易云音乐、QQ 音乐或酷狗音乐官方客户端。第三方接入仅用于个人学习和自有账号播放辅助，不绕过付费、会员、地区、DRM 或下载限制。</p>
    <section class="provider-accounts__list">
      <article v-for="status in statuses" :key="status.providerId">
        <div><strong>{{ providerName(status.providerId) }}</strong><small>{{ statusText(status) }}</small><span v-if="status.capabilityStatuses?.length" class="provider-accounts__capabilities"><i v-for="capability in status.capabilityStatuses" :key="capability.capability" :class="capability.state">{{ capabilityLabel(capability.capability) }} · {{ capabilityState(capability.state) }}</i></span></div>
        <button v-if="status.enabled && status.supportsLogin !== false && (status.state === 'signed-out' || status.state === 'expired')" type="button" @click="$emit('login', status.providerId)">{{ status.state === 'expired' ? '重新登录' : '登录' }}</button>
        <button v-else-if="status.state === 'signed-in'" type="button" @click="$emit('logout', status.providerId)">退出</button>
        <span v-else>{{ status.enabled && status.supportsLogin === false ? "公开接口" : status.errorCode ? "保持关闭" : "等待启用" }}</span>
      </article>
    </section>
    <section class="provider-accounts__order">
      <span>来源优先级</span><strong>{{ order.map(providerName).join(" → ") }}</strong>
      <button type="button" @click="$emit('rotate-order')">轮换顺序</button>
    </section>
    <button class="provider-accounts__consent" type="button" @click="$emit('accept-risk')">我已了解非官方接入说明</button>
  </aside>
</template>

<script setup lang="ts">
import type { ProviderCapability, ProviderCapabilityState, ProviderId, ProviderRuntimeStatus } from "@studyroom/contracts";
defineProps<{ statuses: ProviderRuntimeStatus[]; order: ProviderId[] }>();
defineEmits<{
  (event: "close"): void;
  (event: "login", providerId: ProviderId): void;
  (event: "logout", providerId: ProviderId): void;
  (event: "rotate-order"): void;
  (event: "accept-risk"): void;
}>();
function providerName(providerId: ProviderId) { return providerId === "netease" ? "网易云" : providerId === "qq" ? "QQ 音乐" : "酷狗音乐"; }
function statusText(status: ProviderRuntimeStatus) {
  if (status.errorCode === "PROVIDER_DISABLED") return "实验构建或功能开关未启用";
  if (status.state === "expired") return "登录已过期，请在官方窗口重新登录";
  if (status.errorCode) return `外部阻断 · ${status.errorCode}`;
  if (status.supportsLogin === false) return status.providerId === 'qq' ? '有限搜索与免费曲目播放；账号音乐库尚未接入' : '仅搜索；播放验证与账号音乐库尚未完成';
  return status.state === "signed-in" ? "已登录，仅保存在本机" : "等待登录";
}
function capabilityLabel(capability: ProviderCapability) {
  return ({ search: "搜索", recommendations: "推荐", playlists: "歌单", favorites: "收藏", lyrics: "歌词", playback: "播放" })[capability];
}
function capabilityState(state: ProviderCapabilityState) {
  return state === "available" ? "可用" : state === "externally-blocked" ? "外部阻断" : state === "login-required" ? "需登录" : state === "cooling-down" ? "熔断" : state === "expired" ? "已过期" : "关闭";
}
</script>

<style scoped>
.provider-accounts{width:min(430px,92vw);height:100%;padding:82px 26px 88px;border:1px solid var(--sr-color-line-strong);border-radius:var(--sr-radius-panel) 0 0 var(--sr-radius-panel);box-sizing:border-box;color:var(--sr-color-text);overflow:auto}.provider-accounts header{display:flex;align-items:flex-start;justify-content:space-between}.provider-accounts header small{color:var(--sr-color-accent);font-size:11px;letter-spacing:.18em}.provider-accounts h2{margin:5px 0 0;font-family:var(--sr-font-sans);font-size:28px;font-weight:500}.provider-accounts header button{width:32px;height:32px;border:1px solid var(--sr-color-line);border-radius:50%;background:transparent;color:var(--sr-color-text);font-size:18px;cursor:pointer}.provider-accounts__notice{margin:20px 0;padding:14px;border:1px solid rgba(211,174,113,.25);border-radius:12px;background:rgba(211,174,113,.07);color:var(--sr-color-text-muted);font-size:12px;line-height:1.7}.provider-accounts__list{display:grid;gap:8px}.provider-accounts__list article{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:13px;border:1px solid var(--sr-color-line);border-radius:12px;background:var(--sr-color-surface-raised)}.provider-accounts__list article>div{min-width:0;display:flex;flex-direction:column;gap:4px}.provider-accounts__list small,.provider-accounts__list span{color:var(--sr-color-text-faint);font-size:11px}.provider-accounts__capabilities{display:flex!important;flex-wrap:wrap;gap:3px;margin-top:3px}.provider-accounts__capabilities i{padding:2px 4px;border:1px solid var(--sr-color-line);border-radius:99px;color:var(--sr-color-text-faint);font-size:11px;font-style:normal}.provider-accounts__capabilities i.available{border-color:rgba(211,174,113,.4);color:var(--sr-color-accent)}.provider-accounts button{padding:7px 10px;border:1px solid var(--sr-color-line);border-radius:99px;background:var(--sr-color-surface-raised);color:var(--sr-color-text-muted);font-size:12px;cursor:pointer}.provider-accounts__order{display:grid;gap:7px;margin-top:22px;padding-top:18px;border-top:1px solid var(--sr-color-line)}.provider-accounts__order span{color:var(--sr-color-text-faint);font-size:11px;letter-spacing:.12em}.provider-accounts__order strong{font-size:11px}.provider-accounts__order button{justify-self:start}.provider-accounts__consent{width:100%;margin-top:22px!important;padding:10px!important;border-color:transparent!important;background:var(--sr-color-accent)!important;color:var(--sr-color-accent-ink)!important}
</style>
<style scoped>
.provider-accounts{padding:24px;border-radius:var(--sr-radius-panel);scrollbar-width:thin;scrollbar-gutter:stable}
.provider-accounts header{gap:12px;align-items:center}
.provider-accounts header button{display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;height:44px;min-height:44px;padding:0;line-height:1;box-sizing:border-box}
</style>
