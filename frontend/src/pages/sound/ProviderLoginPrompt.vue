<template>
  <section class="provider-login sr-glass" :class="{ 'provider-login--drawer': closable }" aria-label="平台音乐登录引导">
    <header><span>平台音乐</span><button v-if="closable" class="provider-login__close" type="button" aria-label="关闭平台音乐" @click="$emit('close')"><AppIcon name="close" /></button></header>
    <div class="provider-login__body">
      <span class="provider-login__icon" aria-hidden="true"><AppIcon name="music" /></span>
      <h2>{{ stage === 'moyu' ? '登录，连接你的音乐' : '连接你的音乐账号' }}</h2>
      <p>{{ stage === 'moyu' ? '先登录墨屿，再连接网易云、QQ 音乐或酷狗。' : '墨屿已登录。再连接对应音乐平台，即可搜索歌曲、浏览歌单与播放。' }}</p>
      <ol class="provider-login__steps">
        <li :class="{ done: stage === 'provider' }"><span>{{ stage === 'provider' ? '✓' : '1' }}</span><div><strong>登录墨屿</strong><small>{{ stage === 'provider' ? '已完成' : '开启客户端平台音乐' }}</small></div></li>
        <li :class="{ pending: stage === 'moyu' }"><span>2</span><div><strong>连接音乐平台</strong><small>在平台官方窗口安全登录</small></div></li>
      </ol>
      <button class="provider-login__action" type="button" @click="$emit('login')">{{ stage === 'moyu' ? '登录墨屿' : '连接音乐平台' }} <span aria-hidden="true">→</span></button>
      <small class="provider-login__note">本地音乐与环境音无需登录，随时可用。</small>
    </div>
  </section>
</template>
<script setup lang="ts">
defineProps<{ stage: 'moyu' | 'provider'; closable?: boolean }>();
defineEmits<{ login: []; close: [] }>();
</script>
<style scoped>
.provider-login{width:100%;max-width:460px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-panel);padding:24px;align-self:flex-start;box-sizing:border-box;}
.provider-login--drawer{width:min(430px,100%);align-self:stretch;overflow:auto;}
.provider-login header{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px;color:var(--sr-color-text-muted);}
.provider-login__close{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;padding:0;border:1px solid var(--sr-color-line);border-radius:50%;background:transparent;color:var(--sr-color-text);cursor:pointer;}
.provider-login__body{display:flex;flex-direction:column;align-items:stretch;gap:16px;padding-top:24px;}
.provider-login__icon{width:44px;height:44px;display:grid;place-items:center;border:1px solid var(--sr-color-line);border-radius:14px;background:var(--sr-color-surface-raised);}
.provider-login h2{margin:0;font-family:var(--sr-font-sans);font-size:24px;font-weight:650;line-height:1.4;}
.provider-login p{margin:0;color:var(--sr-color-text-muted);font-size:13px;line-height:1.8;}
.provider-login__steps{list-style:none;display:flex;flex-direction:column;gap:0;margin:4px 0;padding:0;}
.provider-login__steps li{display:flex;align-items:center;gap:12px;padding:14px 0;}
.provider-login__steps li+li{border-top:1px solid var(--sr-color-line);}
.provider-login__steps li>span{flex:0 0 28px;height:28px;display:grid;place-items:center;border:1px solid var(--sr-color-line);border-radius:50%;font-size:12px;}
.provider-login__steps li>div{display:flex;flex-direction:column;gap:5px;}
.provider-login__steps strong{font-size:13px;font-weight:600;}
.provider-login__steps small,.provider-login__note{font-size:12px;color:var(--sr-color-text-muted);line-height:1.6;}
.provider-login__steps .done>span{background:var(--sr-color-accent);color:var(--sr-color-accent-ink);}
.provider-login__steps .pending{color:var(--sr-color-text-muted);}
.provider-login .provider-login__action{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:44px;border:0;border-radius:var(--sr-radius-control);padding:12px 16px;background:var(--sr-color-accent);color:var(--sr-color-accent-ink);font-size:13px;font-weight:600;cursor:pointer;}
.provider-login__note{text-align:center;}
@media(max-width:480px){.provider-login{padding:20px}.provider-login h2{font-size:22px}}
</style>
