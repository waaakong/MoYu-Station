<template>
  <aside class="users-panel glass">
    <div class="panel-head">
      <div><div class="eyebrow">ONLINE</div><h2>用户列表</h2></div>
      <span class="badge">{{ users.length }} 人</span>
    </div>
    <div class="user-list soft-scroll">
      <button v-for="user in users" :key="user.id" type="button" :class="['user-card', { active: String(activeUserId) === String(user.id) }]" @click="$emit('select', user)">
        <span class="avatar">
          <img v-if="user.avatarUrl" :src="assetUrl(user.avatarUrl)" alt="" loading="lazy" decoding="async" />
          <span v-else>{{ avatarText(user.nickname || user.username) }}</span>
        </span>
        <span class="user-meta">
          <strong>{{ user.nickname || user.username }}</strong>
          <span :class="['status', statusClass(user.onlineStatus)]"><i aria-hidden="true"></i>{{ statusText(user.onlineStatus) }}</span>
        </span>
        <span v-if="unread[user.id]" class="unread">{{ unread[user.id] }}</span>
      </button>
      <div v-if="!users.length" class="empty-note">还没有可聊天的用户。</div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { cloudMediaUrl as assetUrl } from "../../utils/cloudMedia";
type ChatUser = { id: string | number; username?: string; nickname?: string; avatarUrl?: string; onlineStatus?: string };
defineProps<{ users: ChatUser[]; activeUserId?: string | number | null; unread: Record<string | number, number> }>();
defineEmits<{ select: [user: ChatUser] }>();
function avatarText(name?: string) { return String(name || "S").trim().slice(0, 1).toUpperCase(); }
function statusClass(status?: string) { const value = String(status || "").toUpperCase(); return value === "FOCUSING" ? "focus" : value === "PLAYING" ? "play" : value === "OFFLINE" ? "offline" : "idle"; }
function statusText(status?: string) { const value = String(status || "").toUpperCase(); return value === "FOCUSING" ? "专注" : value === "PLAYING" ? "娱乐" : value === "OFFLINE" ? "离线" : "空闲"; }
</script>

<style scoped>
.users-panel { min-height:0;height:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.16);border-radius:28px;background:rgba(40,43,41,.58);backdrop-filter:blur(24px);box-shadow:0 24px 90px rgba(0,0,0,.28);overflow:hidden;animation:riseIn 760ms cubic-bezier(.22,1,.36,1) both;color:#fff; }
.panel-head { min-height:88px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:23px 24px 17px;border-bottom:1px solid rgba(255,255,255,.1);box-sizing:border-box; }
.eyebrow { margin-bottom:7px;color:rgba(255,255,255,.56);font-size:11px;font-weight:950;letter-spacing:.12em; }
h2 { margin:0;font-size:25px;line-height:1.08;font-weight:950; }
.badge { display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.09);color:rgba(255,255,255,.78);font-size:12px;font-weight:900;white-space:nowrap; }
.user-list { height:calc(100% - 88px);overflow:auto;padding:16px;box-sizing:border-box; }
.user-card { width:100%;display:flex;align-items:center;gap:12px;padding:13px;margin-bottom:12px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:rgba(255,255,255,.075);color:#fff;text-align:left;font:inherit;cursor:pointer;transition:transform 200ms ease,background 200ms ease,border-color 200ms ease; }
.user-card:hover,.user-card.active { transform:translateY(-2px);background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3); }
.avatar { width:48px;height:48px;flex:none;border-radius:16px;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(255,255,255,.14);background:linear-gradient(135deg,rgba(255,255,255,.24),rgba(255,255,255,.06));font-weight:950; }
.avatar img { width:100%;height:100%;object-fit:cover; }.user-meta{min-width:0;flex:1}.user-meta strong{display:block;font-size:14px;font-weight:950;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.status{display:inline-flex;align-items:center;gap:7px;margin-top:6px;color:rgba(255,255,255,.62);font-size:12px;font-weight:850}.status i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.44);box-shadow:0 0 0 4px rgba(255,255,255,.08)}.status.focus i{background:#68d68b;box-shadow:0 0 0 4px rgba(104,214,139,.16)}.status.play i{background:#e6c66f;box-shadow:0 0 0 4px rgba(230,198,111,.16)}.status.offline{opacity:.56}
.unread{min-width:22px;height:22px;display:grid;place-items:center;border-radius:999px;background:rgba(255,255,255,.92);color:#111;font-size:11px;font-weight:950}.empty-note{padding:22px;color:rgba(255,255,255,.62);text-align:center;line-height:1.8;font-weight:760}
.soft-scroll{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.34) transparent}.soft-scroll::-webkit-scrollbar{width:5px}.soft-scroll::-webkit-scrollbar-thumb{border-radius:999px;background:rgba(255,255,255,.28)}
@keyframes riseIn{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
</style>
