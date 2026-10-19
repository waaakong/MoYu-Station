<template>
  <main class="page" :class="{ leaving: isLeaving, quiet: shell.motionReduced }">
    <header class="topbar">
      <div class="brand">
        <div class="brand-icon sr-glass-control" aria-label="墨屿自习室图标">
          <BrandMark />
        </div>
        <span>墨屿自习室</span>
      </div>
      <div class="top-actions">
        <RouterLink v-if="!isDesktop" class="login-button sr-glass-control download-link" to="/download">下载客户端</RouterLink>
        <button class="login-button sr-glass-control" type="button" @click="enterLoginPage">登录</button>
      </div>
    </header>

    <section class="hero" data-motion-group>
      <div class="kicker">FOCUS · LISTEN · RESET</div>
      <h1>给今天留一间<br />会呼吸的自习室</h1>
      <p class="copy">
        先进入，再选择一个窗外风景。最后把专注时长、环境音和学习节奏调成适合现在的样子。
      </p>
      <div class="actions">
        <button class="start" type="button" @click="enterScenePage">进入本地空间 →</button>
        <span class="hint">Enter 也可以继续</span>
      </div>
      <p v-if="navigationError" role="alert">{{ navigationError }}</p>
    </section>

    <div class="window-bottom"></div>
    <div class="top-readability"></div>
    <div class="transition-curtain" aria-hidden="true"></div>
  </main>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useShellStore } from '../stores/shell';

const router = useRouter();
const shell = useShellStore();
const isDesktop = Boolean(window.studyRoomDesktop);
const isLeaving = ref(false);
const navigationError = ref('');
let alive = true;

async function navigateAfterCurtain(route) {
  if (isLeaving.value) return;
  isLeaving.value = true;
  navigationError.value = '';
  try {
    const failure = await router.push(route);
    if (failure && alive) { isLeaving.value = false; navigationError.value = '页面跳转未完成，请重试。'; }
  } catch {
    if (alive) { isLeaving.value = false; navigationError.value = '页面加载失败，请重试进入。'; }
  }
}

function enterScenePage(event) {
  navigateAfterCurtain({ name: "scene" });
}

function enterLoginPage(event) {
  navigateAfterCurtain({ name: "login", query: { redirect: "scene" } });
}

function handleKeydown(event) {
  if (event.key !== "Enter") return;
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (event.isComposing || event.defaultPrevented || ['input','textarea','select','button','a'].includes(tag) || document.activeElement?.isContentEditable) return;
  event.preventDefault();
  navigateAfterCurtain({ name: "scene" });
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  alive = false;
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<style scoped>
.download-link{display:inline-flex;align-items:center;text-decoration:none;color:inherit;margin-right:10px}
.page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  --content-x: clamp(36px, 4.25vw, 58px);
  --content-left: 0px;
  padding: 42px var(--content-x);
  background:
    linear-gradient(90deg, rgba(15, 20, 24, .88) 0 5.2%, transparent 5.2% 92.8%, rgba(15, 20, 24, .86) 92.8% 100%),
    linear-gradient(180deg, rgba(11, 14, 18, .16), rgba(11, 14, 18, .5)),
    url("../assets/images/welcome-hero-misty-lake.jpg") center / cover no-repeat;
  transition:
    filter 900ms cubic-bezier(.22, 1, .36, 1),
    transform 900ms cubic-bezier(.22, 1, .36, 1);
}

.page::before,
.page::after {
  content: "";
  position: fixed;
  top: 0;
  bottom: 0;
  z-index: 1;
  width: 18px;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, .14), transparent 35%, rgba(0, 0, 0, .38)),
    rgba(11, 14, 18, .45);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .08), 0 0 32px rgba(0, 0, 0, .5);
  pointer-events: none;
}

.page::before {
  left: calc(var(--content-x) + 22px);
}

.page::after {
  right: calc(var(--content-x) + 22px);
}

.top-readability {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
  height: 150px;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(6, 9, 12, .36), rgba(6, 9, 12, .14) 52%, transparent);
}

.window-bottom {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  height: 72px;
  background: linear-gradient(180deg, rgba(16, 20, 23, .25), rgba(10, 13, 16, .92));
  box-shadow: 0 -1px 0 rgba(255, 255, 255, .08), 0 -18px 52px rgba(0, 0, 0, .38);
  pointer-events: none;
}

.topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition:
    opacity 620ms ease,
    transform 700ms cubic-bezier(.22, 1, .36, 1);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, .9);
  font-size: 13px;
  font-weight: 800;
}

.brand-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, .2);
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 24%, rgba(255, 255, 255, .24), transparent 38%),
    rgba(255, 255, 255, .08);
  backdrop-filter: blur(16px);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05), 0 8px 24px rgba(0, 0, 0, .18);
}

.brand-icon svg {
  display: block;
  width: 19px;
  height: 19px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.login-button {
  padding: 9px 16px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 999px;
  background: rgba(18, 22, 26, .46);
  color: rgba(255, 255, 255, .82);
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transform: scale(1);
  backdrop-filter: blur(18px);
  transition:
    background 220ms ease,
    border-color 220ms ease,
    color 220ms ease,
    transform 220ms cubic-bezier(.22, 1, .36, 1);
}

.login-button:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, .28);
  background: rgba(255, 255, 255, .14);
  transform: translateY(-1px);
}

.login-button:active {
  transform: scale(.94);
}

.hero {
  position: relative;
  z-index: 2;
  width: min(760px, 78vw);
  margin-top: 154px;
  margin-left: var(--content-left);
  transition:
    opacity 620ms ease,
    transform 700ms cubic-bezier(.22, 1, .36, 1);
}

.kicker {
  margin-bottom: 24px;
  color: rgba(255, 255, 255, .82);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .22em;
}

h1 {
  max-width: 720px;
  margin: 0;
  color: rgba(255, 255, 255, .92);
  font-size: clamp(54px, 6.2vw, 86px);
  line-height: 1.08;
  letter-spacing: 0;
  text-shadow: 0 20px 60px rgba(0, 0, 0, .32);
}

.copy {
  max-width: 650px;
  margin: 26px 0 0;
  color: rgba(255, 255, 255, .86);
  font-size: 16px;
  line-height: 1.9;
  text-shadow: 0 12px 30px rgba(0, 0, 0, .36);
}

.actions {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-top: 34px;
}

.start {
  min-width: 150px;
  padding: 14px 22px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, .92);
  color: #12161a;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  transition:
    transform 220ms cubic-bezier(.22, 1, .36, 1),
    background 220ms ease;
}

.start:hover {
  background: #fff;
  transform: translateY(-1px);
}

.hint {
  color: rgba(255, 255, 255, .78);
  font-size: 13px;
  font-weight: 700;
  animation: hintBreath 3.8s ease-in-out 1.2s infinite;
  transition:
    color 220ms ease,
    text-shadow 220ms ease,
    transform 220ms cubic-bezier(.22, 1, .36, 1);
}

.start:hover + .hint {
  color: rgba(255, 255, 255, .96);
  text-shadow: 0 0 18px rgba(255, 255, 255, .42);
  transform: translateX(2px);
}

.transition-curtain {
  position: fixed;
  inset: 0;
  z-index: 8;
  pointer-events: none;
  opacity: 0;
  background:
    radial-gradient(circle at 50% 42%, rgba(255, 255, 255, .18), transparent 28%),
    rgba(8, 12, 16, .74);
  backdrop-filter: blur(0);
  transition:
    opacity 720ms ease,
    backdrop-filter 820ms cubic-bezier(.22, 1, .36, 1);
}

.page.leaving {
  filter: blur(4px) saturate(.9) brightness(.82);
  transform: scale(1.018);
}

.page.leaving .hero,
.page.leaving .topbar {
  opacity: 0;
  transform: translateY(-12px);
}

.page.leaving .transition-curtain {
  opacity: 1;
  backdrop-filter: blur(10px);
}

@keyframes hintBreath {
  0%,
  100% {
    opacity: .72;
    text-shadow: 0 0 0 rgba(255, 255, 255, 0);
  }

  50% {
    opacity: 1;
    text-shadow: 0 0 14px rgba(255, 255, 255, .34);
  }
}

@media (max-width: 760px) {
  .page {
    padding: 28px 24px;
  }

  .page::before {
    left: 14px;
  }

  .page::after {
    right: 14px;
  }

  .topbar {
    align-items: flex-start;
    gap: 14px;
  }

  .top-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .hero {
    width: 100%;
    margin-top: 110px;
  }

  h1 {
    font-size: 48px;
  }

  .actions {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page,
  .hero,
  .topbar,
  .transition-curtain,
  .hint {
    animation: none;
    transition-duration: 1ms;
  }

  .page.leaving {
    filter: none;
    transform: none;
  }
}
.page{min-height:100%;height:100%;box-sizing:border-box;padding:clamp(24px,4vw,48px) var(--content-x);display:grid;grid-template-rows:auto minmax(0,1fr);transition:none}
.standalone-desktop .page{padding-top:64px}
.page::before,.page::after,.top-readability,.window-bottom,.transition-curtain{position:absolute}
.hero{align-self:center;margin-top:0;padding-block:clamp(24px,5vh,56px);width:min(760px,100%)}
h1{font-size:clamp(40px,5.5vw,76px);line-height:1.14;font-weight:650;letter-spacing:-.025em}.copy{max-width:540px;font-size:15px;line-height:1.8;margin-top:22px}.kicker{margin-bottom:20px;font-weight:600;letter-spacing:.16em}
.login-button,.start{min-height:44px;border-radius:var(--sr-radius-control,12px);font-weight:600;transition:background-color 140ms ease,transform 120ms var(--sr-ease-out)}
.start{min-height:48px}.login-button:hover,.start:hover{transform:none}.login-button:active,.start:active{transform:scale(.98)}
.login-button:focus-visible,.start:focus-visible{outline:2px solid #f1f5ed;outline-offset:4px}
.hint{animation:none;transition:none;font-weight:400}.start:hover+.hint{transform:none;text-shadow:none}
.hero,.topbar{transition:opacity 180ms var(--sr-ease-out)}.transition-curtain{background:#0d1512;backdrop-filter:none;transition:opacity 180ms var(--sr-ease-out)}
.page.leaving{transform:none;filter:none}.page.leaving .hero,.page.leaving .topbar{transform:none}.page.leaving .transition-curtain{backdrop-filter:none}
.quiet *{animation:none!important;transition:none!important}
@media(hover:hover) and (pointer:fine){.start:hover{background:#e2ebd9}.login-button:hover{background:rgba(240,246,237,.16)}}
@media(max-width:760px){.page{--content-x:24px;padding:24px}.hero{margin:0;width:100%}h1{font-size:clamp(34px,8vw,48px)}.copy{font-size:14px}.actions{gap:14px}.window-bottom{height:32px}.kicker{font-size:10px;letter-spacing:.12em}}
@media(max-height:650px) and (min-width:761px){.page{padding-block:24px}.hero{padding-block:20px}h1{font-size:48px}.copy{margin-top:16px}.actions{margin-top:22px}.window-bottom{height:28px}}
.brand-icon,.login-button{backdrop-filter:none;-webkit-backdrop-filter:none}
.login-button{color:var(--sr-color-text)}
.start{background:var(--sr-color-accent);color:var(--sr-color-accent-ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 6px 20px rgba(4,10,22,.18)}
.transition-curtain{background:var(--sr-color-canvas)}
@media(hover:hover) and (pointer:fine){.start:hover{background:#f5f8ff}}
</style>
