<template>
  <section class="profile-panel" aria-labelledby="profile-updates-title">
    <header class="profile-section-head"><div><p>PRIVATE UPDATES</p><h1 id="profile-updates-title">客户端版本</h1></div><span>{{ channelText }}</span></header>
    <div class="profile-stat-grid">
      <article><span>当前版本</span><strong>{{ updates.status.currentVersion }}</strong></article>
      <article><span>更新状态</span><strong>{{ stateText }}</strong></article>
      <article><span>目标版本</span><strong>{{ updates.status.availableVersion || "暂无" }}</strong></article>
    </div>
    <div v-if="updates.status.state === 'downloading'" class="profile-progress" role="progressbar" aria-label="更新下载进度" :aria-valuenow="Math.round(updates.status.progressPercent || 0)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: updates.progressLabel }"></i><span>{{ updates.progressLabel }}</span></div>
    <div class="profile-note"><strong>{{ updates.status.message }}</strong><p v-if="updates.status.downloadSource">下载来源：{{ updates.status.downloadSource === 'github' ? 'GitHub Releases' : '受保护服务器' }}</p><p v-if="updates.status.releaseNotes">{{ updates.status.releaseNotes }}</p><p v-if="updates.status.errorCode">错误码：{{ updates.status.errorCode }}</p></div>
    <div class="profile-actions">
      <label v-if="updates.status.automaticUpdates"><input type="checkbox" :checked="updates.status.automaticChecks !== false" @change="updates.setAutomaticChecks(($event.target as HTMLInputElement).checked)"> 自动检查更新（不自动安装）</label>
      <button v-if="updates.status.state === 'downloading' || updates.status.updateIntent" type="button" @click="updates.cancelDownload">{{ updates.status.updateIntent ? '取消本次更新' : '取消下载' }}</button>
      <button v-if="updates.status.canRetry" type="button" @click="updates.check">重新检查</button>
      <button v-if="updates.status.downloadPageUrl && (updates.status.state === 'manual-update-available' || updates.status.errorCode === 'UPDATE_CODE_SIGNATURE_REQUIRED')" type="button" @click="openDownloadPage">前往下载页</button>
      <button v-if="updates.status.oneClickEnabled && !updates.status.updateIntent && ['available', 'required', 'downloaded', 'scheduled'].includes(updates.status.state) && !updates.status.errorCode" type="button" @click="updates.start">{{ updates.status.trustMode === 'manifest-signed' ? '更新并重启（未签名安装包）' : '更新并重启' }}</button>
      <button v-else-if="!updates.status.oneClickEnabled && ['available', 'required'].includes(updates.status.state) && !updates.status.errorCode" type="button" @click="updates.download">下载更新</button>
      <button v-if="updates.status.state === 'available'" type="button" @click="updates.defer">延后 24 小时</button>
      <button v-if="!updates.status.oneClickEnabled && updates.status.trustMode !== 'manifest-signed' && updates.status.canInstall" type="button" :disabled="updates.installing" @click="updates.install">{{ updates.installing ? '保存并复核中…' : '保存并重启安装' }}</button>
    </div>
    <p v-if="updates.actionError" role="alert">{{ updates.actionError }}</p>
    <p v-if="updates.status.automaticUpdates" class="profile-lead">登录后自动检查授权版本。{{ updates.status.oneClickEnabled ? '点击一次“更新并重启”授权本次下载、校验、保存、备份、安装及重启；重启倒计时可以取消。' : '当前构建需要手动确认下载和安装。' }}专注、播放或未提交草稿不会被自动打断。{{ updates.status.installEnabled ? '' : '当前构建未开启安全安装模式，自动下载与安装保持关闭。' }}</p>
    <p v-else class="profile-lead">当前使用下载页版本检查，发现新版后需手动下载安装。自动下载、安装及生产推送尚未启用。</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUpdatesStore } from "../../stores/updates";
const updates = useUpdatesStore();
const channelText = computed(() => ({ stable: "稳定通道", beta: "Beta 通道", "provider-experimental": "音乐实验通道" }[updates.status.channel] || updates.status.channel));
const stateText = computed(() => ({ disabled: "未启用", unauthorized: "等待登录", checking: "检查中", available: "有可选更新", "manual-update-available": "发现新版（手动更新）", downloading: "下载中", countdown: "重启倒计时", preparing: "保存与备份中", installing: "安装启动中", downloaded: "已下载", scheduled: "等待任务结束", required: "需要更新", "not-available": "已是最新版", error: "更新失败", idle: "待检查" }[updates.status.state] || updates.status.state));
async function openDownloadPage() {
  const url=updates.status.downloadPageUrl;
  if(url) await window.studyRoomDesktop?.openExternal(url);
}
</script>
