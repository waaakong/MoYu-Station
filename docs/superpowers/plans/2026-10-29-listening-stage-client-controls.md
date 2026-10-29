# 听歌舞台与客户端控制改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本次采用当前会话内顺序执行，不自动派发子代理。

**Goal:** 按已确认设计交付舞台重构、双行颜色设置、透明桌面歌词、八向全局轮盘，以及 SSE 断连修复。

**Architecture:** 复用现有 Vue 播放器、歌词解析器、Electron 隔离窗口与 IPC。先建立共享歌词会话及兼容设置，再分离歌词样式与背景渲染；SSE 作为独立后端修复提交。GSAP 负责有界 UI 动效，音频分析、原生按键与透明窗口分别验收。

**Tech Stack:** Vue 3、Pinia、TypeScript、GSAP、Canvas/Web Audio、Electron、Zod、Spring MVC SseEmitter、Vitest、Playwright、JUnit。

---

## 执行约束与检查点

- 规格：`docs/superpowers/specs/2026-10-29-listening-stage-client-controls-design.md`，用户已确认。
- 计划准备基线：main，规格提交 `9a61a98`；实施前记录实际 HEAD。工作目录为本仓库，原 `chasethemoment` 脏目录不参与构建。
- 所有维护提交作者／提交者为 WaaaKong，使用已核验隐私邮箱。只暂存每项任务列出的文件；不强推、不改历史、不删除无关分支。
- 不更改生产版本、推送范围、数据库或正式安装。实验包和真实按键验收在代码检查通过后准备；运行中的客户端正常退出，不强制结束。
- 每个任务完成后执行定向检查并提交；未通过时修正该任务，不推进依赖它的任务。不得把以下未勾选步骤报告为已执行。
- UI 文案／布局核对不新增镜像实现的单测；只为时钟、竞态、校验、注册和资源生命周期编写行为测试。
- 各命令在仓库根目录运行；Java 命令使用 `mvn -f backend/pom.xml`。命令所需运行时不可用时先定位已有运行时，不安装无关软件。

## 文件职责

| 部分 | 现有入口 | 新增边界 |
|---|---|---|
| SSE | `backend/src/main/java/com/studyroom/service/AdminDashboardStreamService.java`、`common/GlobalExceptionHandler.java` | `common/ClientDisconnects.java`：窄范围断连识别 |
| 设置契约 | `packages/contracts/src/desktopMusic.ts`、`desktop/src/main/music/shortcuts.ts` | 新字段默认与迁移标记，不增加自由 IPC |
| 设置保存 | `desktop/src/main/music/desktopMusic.ts`、`desktopWheel.ts`、`frontend/src/audio/lyrics/desktopLyrics.ts` | 仅轮盘配置变化才重注册、失败回退、界面草稿隔离 |
| 设置页面 | `frontend/src/pages/ProfilePage.vue`、`profile/ProfileSidebar.vue`、`sound/DesktopMusicControls.vue` | `profile/ProfileClientSettingsPanel.vue`、`components/controls/LyricColorPicker.vue` |
| 共享歌词 | `frontend/src/audio/lyrics/lyricsController.ts`、`trackLyricsLoader.ts`、`desktopLyrics.ts`、`pages/sound/LyricsPanel.vue` | `sharedLyricsSession.ts`、`stageClock.ts` |
| 舞台 | `frontend/src/pages/sound/ListeningStage.vue`、`VisualizerCanvas.vue`、`audio/visualizer/visualizerController.ts` | `pages/sound/stage/` 内偏好、样式和背景模块 |
| 原生窗口 | `desktop/src/renderer/wheel.{html,css,js}`、`lyrics.{html,css,js}`，对应 main/preload/protocol | 复用现有窗口身份、白名单和 hook，不新增系统权限 |

## Task 1：SSE 正常断连与已提交响应

**Files:**
- Create: `backend/src/main/java/com/studyroom/common/ClientDisconnects.java`
- Modify: `backend/src/main/java/com/studyroom/common/GlobalExceptionHandler.java`
- Modify: `backend/src/main/java/com/studyroom/service/AdminDashboardStreamService.java`
- Test: `backend/src/test/java/com/studyroom/common/GlobalExceptionHandlerTest.java`
- Create test: `backend/src/test/java/com/studyroom/common/ClientDisconnectsTest.java`
- Create test: `backend/src/test/java/com/studyroom/service/AdminDashboardStreamServiceTest.java`

- [x] 添加行为用例：broken pipe／connection reset／AsyncRequestNotUsableException 可识别；业务 IOException、普通 IllegalStateException 不能笼统视为客户端取消。断开后重复 completion/error/send 不再广播，普通业务错误仍返回原 JSON。
- [x] 新断连分类器沿 cause 链最多16层检查，避免异常 cause 循环。使用以下有界骨架，消息匹配仅限 IOException 或实际容器断连异常类型：

```java
for (Throwable current = error; current != null && depth++ < 16; current = current.getCause()) {
  if (current.getClass().getName().equals("org.springframework.web.context.request.async.AsyncRequestNotUsableException")) return true;
  if (current instanceof java.io.IOException) {
    String message = String.valueOf(current.getMessage()).toLowerCase(java.util.Locale.ROOT);
    if (message.contains("broken pipe") || message.contains("connection reset")) return true;
  }
}
return false;
```

- [x] 在 Spring 异常处理器中增加断连专用处理；使用响应是否 committed 和实际 SSE content type 决定不写第二个错误体。未提交的普通 HTTP 异常维持原权限／业务映射；真实 SSE 业务失败关闭连接并记录服务错误。移除会强制正常断连响应变成500的注解路径。
- [x] 收拢 emitter 移除／完成至幂等路径；发送先取得快照，再向仍登记的 emitter 发送。仅处理已关闭 emitter 的 IllegalStateException；其余异常不得静默丢弃。
- [x] Run: `mvn -f backend/pom.xml -Dtest=ClientDisconnectsTest,GlobalExceptionHandlerTest,AdminDashboardStreamServiceTest test`。预期全部通过，再跑后端完整测试。首次新增用例先确认能复现旧行为，不能只验证分类器字符串。
- [x] 提交本任务6个文件，提交信息 `fix(sse): handle disconnected streams without secondary JSON writes`。

## Task 2：设置契约与保守迁移

**Files:** `packages/contracts/src/desktopMusic.ts`、`desktop/src/main/music/shortcuts.ts`、`desktop/test/lyricsProtocol.test.ts`、`desktop/test/desktopLyricsWindow.test.ts`；新增 `desktop/test/desktopMusicMigration.test.ts`。

- [x] 扩展 `DesktopLyricsStyle`，保留已有字段，新增字段在读取旧值时填默认值：

```ts
export interface DesktopLyricsStyle {
  fontSize:number;
  highlight:string;
  rows:1|2;
  base?:string;
  fontFamily?:'system'|'sans'|'serif';
  opacity?:number;
  smoothScroll?:boolean;
}
```

- [x] Zod 中 highlight/base 限制为 `/^#[0-9a-fA-F]{6}$/`；base 默认 `#aab7a3`、fontFamily 默认 system、opacity 默认 .85 且范围0–1、smoothScroll 默认true。fontSize保留22–48、rows保留1或2。旧设置不因新增字段整体解析失败。
- [x] 采用无写入的兼容读取：新增字段默认化，对无法识别是否用户自定义的旧组合键一律保留；只为缺失 wheel 配置填当前默认 Ctrl＋Alt。移除构造器中无条件改写 Control＋Alt＋Space 的路径。本轮不改写旧值，因此不创建无实际迁移用途的标记。
- [x] 旧 `shortcutsEnabled` 与 `shortcuts` 字段保持兼容读取，但启动和保存都不再注册独立媒体快捷键。不改内部 mediaCommand，播放器／轮盘／歌词按钮继续使用它。
- [x] 单测覆盖：旧最小设置能读、原色默认、非法CSS拒绝、范围边界、重启后自定义 Control＋Alt＋Space 保留、不触发 MediaPlayPause 注册。Run: `npm run test:unit --workspace study-room-desktop -- desktopMusicMigration.test.ts lyricsProtocol.test.ts desktopLyricsWindow.test.ts`；预期通过。
- [x] Run: `npm run typecheck --workspace @studyroom/contracts`，提交本任务文件。

## Task 3：设置保存与轮盘注册事务

**Files:** `desktop/src/main/music/desktopMusic.ts`、`desktopWheel.ts`、`frontend/src/audio/lyrics/desktopLyrics.ts`、`frontend/src/pages/sound/DesktopMusicControls.vue`；新增 `desktop/test/desktopMusicSave.test.ts`，扩展 `frontend/test/desktopWheel.test.ts`。

- [ ] 在注册调用边界添加可注入测试替身，记录 configure／持久化调用次序。用例分别制造新键注册失败、持久化失败、重复保存、只改歌词和迟到界面回执。
- [x] 用稳定字段比较判定 wheel 是否变化，不依赖对象引用：

```ts
const wheelChanged = previous.wheel?.enabled !== settings.wheel?.enabled
  || previous.wheel?.accelerator !== settings.wheel?.accelerator
  || previous.wheel?.allowFullscreen !== settings.wheel?.allowFullscreen
  || JSON.stringify(previous.wheel?.slots) !== JSON.stringify(settings.wheel?.slots);
```

- [x] 仅 wheelChanged 时 configure；成功后持久化，再发布新状态。注册或持久化失败恢复旧配置、返回具体中文原因；恢复失败单独报告，不谎称旧键仍工作。歌词样式保存不重启 hook。
- [x] 设置页草稿在读取完成后初始化；本地 dirty 时普通状态回执不覆盖草稿；保存按钮 pending 时禁用。收到本次保存成功才更新已保存基线，失败保留用户编辑。
- [ ] Run: `npm run test:unit --workspace study-room-desktop -- desktopMusicSave.test.ts wheelProtocol.test.ts`；`npm run test --workspace study-room-frontend -- desktopWheel.test.ts`。预期只改歌词 configure 为0次，注册失败不写新配置。
- [ ] 提交本任务文件，保持main可构建。

## Task 4：客户端设置页与统一颜色弹层

**Files:** Create `frontend/src/pages/profile/ProfileClientSettingsPanel.vue`、`frontend/src/components/controls/LyricColorPicker.vue`、`frontend/src/utils/lyricColor.ts`；Modify `ProfilePage.vue`、`profile/ProfileSidebar.vue`、`sound/DesktopMusicControls.vue`；Create `frontend/test/lyricColor.test.ts`、`frontend/e2e/client-music-settings.spec.ts`。

- [x] 新页面复用当前 profile 模块选择方式，模块键 `client-settings`，只在 desktop bridge 存在时展示。声音页删除旧完整表单，保留“打开客户端设置”链接。未登录本地用户可调本机设置，不增加云端权限要求。
- [x] 分为桌面歌词／快捷轮盘两类；字段逐一绑定 Task2 契约。保留显示、锁定、找回、字体、字号、行数、平滑上滑、不透明度、wheel enabled／allowFullscreen／slots／accelerator。
- [x] 创建颜色规范化函数并先写边界测试：

```ts
export function normalizeLyricColor(input:string):string|null {
  const value=input.trim().replace(/^#?/,'#');
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}
```

- [x] 两行色板按确认的10种预设＋彩色按钮排列；原色紧随高亮色。LyricColorPicker 使用 props `modelValue:string`、`label:string`，emit `update:modelValue`，只发有效标准色；HEX草稿与有效值分离。
- [ ] 调色盘采用二维选色、色相／饱和度／明度条、HEX和完成按钮；pointer capture保证拖动，滑条支持键盘。Esc／外部点击关闭并丢弃无效HEX草稿，焦点回到彩色按钮，不触发外层页面关闭。
- [ ] 复用 AppSelect 及既有 GSAP 生命周期模式；下拉框与调色盘使用统一层级管理，减少动态时不位移。录制展示组合键、Esc恢复原键、保存反馈与真实主进程结果绑定；产品中不加入模拟故障按钮。
- [ ] Run: `npm run test --workspace study-room-frontend -- lyricColor.test.ts`。浏览器用例检查两行各10色、独立更新、保存失败保留、弹层焦点与Esc、非法草稿关闭不阻塞保存、网页无桌面入口。样式采用已确认预览人工对照，不新增无价值组件快照测试。
- [ ] 提交组件、工具和相关测试。

> 2026-10-29：Task3/4实现和本地回归详见验证记录；原生录制互斥及完整浏览器CI仍未验收，因此相关步骤不勾选。

## Task 5：共享歌词会话与真实舞台时钟

**Files:** Create `frontend/src/audio/lyrics/sharedLyricsSession.ts`、`stageClock.ts`；Modify `desktopLyrics.ts`、`pages/sound/LyricsPanel.vue`；Test `frontend/test/lyricsController.test.ts`、Create `sharedLyricsSession.test.ts`、`stageClock.test.ts`。

- [x] 保留 LyricsController 作为逐行解析／操作取消实现。共享层只建立一个正在播放会话，状态包含 track/source identity、account epoch、offset、loading/error、parsed lines；歌词面板和桌面发布器不再各自 new Controller并独立读同一首。
- [x] 共享会话公开 `subscribe(listener):()=>void`、`setTrack(identity,loadLyrics,loadOffset):Promise<void>`、`setPosition(positionMs):void`、`invalidate():void`、`dispose():void`；listener 接收现有 LyricsState 加 error，不直接拥有播放器控制权。单例由应用音频生命周期创建与销毁，组件取消订阅不清除其他消费者。
- [x] 用请求票据保护setTrack：身份或epoch改变即失效；旧loader完成不能覆盖新曲。偏移刷新只更新当前identity；account/source加入缓存键，缓存只存歌词不存凭据。
- [x] StageClock 的输入为 `{positionMs,playing,rate,observedAt}`；query输出以播放器观测位置为准。暂停不插值，seek及状态更新重设锚点，不把歌词偏移叠加两次。
- [x] 新测试先证明两个消费者只有一次loader调用、移除一个订阅后另一个正常、快速A→B旧A迟到不覆盖、账号epoch失效、暂停时钟恒定和seek立即定位。现有逐行／逐字解析测试继续通过。
- [x] Run: `npm run test --workspace study-room-frontend -- sharedLyricsSession.test.ts stageClock.test.ts lyricsController.test.ts trackLyricsLoader.test.ts enhancedLyrics.test.ts`。通过后提交本任务。

## Task 6：舞台偏好、三种布局和六种歌词样式

**Files:** Modify `frontend/src/pages/sound/ListeningStage.vue`、`LyricsPanel.vue`；Create `frontend/src/pages/sound/stage/stagePreferences.ts`、`lyricStyles.ts`、`StageLyrics.vue`；Test `frontend/test/stagePreferences.test.ts`、`frontend/e2e/listening-stage-polish.spec.ts`、`sound-stage-persistence.spec.ts`。

- [x] 用版本化偏好定义选项，不让UI标签成为存储标识：

```ts
export type StageLayout='cover'|'lyrics'|'visual';
export type StageLyricStyle='scroll'|'focus'|'steps'|'giant'|'chat'|'story';
export type StageBackground='cover'|'spectrum'|'wave'|'particles'|'off';
export interface StagePreferences {
  version:2; layout:StageLayout; lyricStyle:StageLyricStyle;
  background:StageBackground; quality:'auto'|24|40|60;
  intensity:number; depth:number;
}
```

- [x] 旧构图／视觉设置映射到新偏好，未知值回退，保留旧数据避免不可逆迁移。强度和深度限制0–1。新增测试逐个验证旧值、损坏JSON和未知枚举。
- [x] 三布局继续共享全局播放器和返回入口；纯视觉隐藏歌词选择但保留选择值。舞台设置按布局／歌词／背景／性能分组，保存失败保留当前预览并说明未保存。
- [x] StageLyrics 使用共享会话，只渲染当前行邻近窗口；样式注册表定义 scroll/focus/steps/giant/chat/story 的布局和当前行过渡。story使用track identity稳定种子和绝对时间模板，无随机每帧抖动；seek直接重算。
- [x] GSAP tween绑定组件context；换曲／seek杀掉旧过渡，减少动态使用当前句静态样式。真实words不存在时禁用模拟逐字wipe，设置外观示例与真实歌词区分。
- [ ] 浏览器用例逐一选择3布局、6样式并往返，检查偏好恢复、长句不出界、返回控制可达、无歌词及错误状态；不更新历史视觉容差掩盖问题。
- [ ] Run: `npm run test --workspace study-room-frontend -- stagePreferences.test.ts` 与前端typecheck；定向浏览器命令见Task10。通过后提交。

## Task 7：四种背景与真实音频分析

**Files:** Modify `frontend/src/pages/sound/VisualizerCanvas.vue`、`frontend/src/audio/visualizer/visualizerController.ts`；Create `frontend/src/pages/sound/stage/backgrounds/{types,cover,spectrum,wave,particles}.ts`、`backgroundRegistry.ts`；Create `frontend/test/stageBackgroundLifecycle.test.ts`。

- [ ] 复用现有分析器读取入口，先核对是否总混音；舞台设置及提示明确响应源。不创建第二个 AudioContext，不额外请求平台URL或凭据。
- [ ] 为每种背景定义一致生命周期 `resize(width,height,dpr)`、`draw(frame)`、`dispose()`。frame只传真实分析数据、播放位置、暂停／减少动态和偏好；无分析数据传null，绘制静态氛围而非合成响应。
- [ ] cover缓存小尺寸封面色彩与柔化纹理；spectrum实现平滑峰值、轮廓、柔光、峰线和弱倒影；wave实现已确认开放式三层流动波带；particles使用封面采样、边缘／亮度深度和有限星尘。
- [ ] 粒子、离屏画布与纹理数量有固定上限；离屏柔光使用降分辨率画布。质量档控制采样数量和FPS上限，自动档依据实际帧耗时降级，避免反复升降。
- [ ] 单测只验证生命周期：切换背景销毁一次、隐藏后不继续请求帧、暂停无时钟推进、数据null不生成随机频谱、减少动态固定几何。真实视觉和耗时用浏览器及实验包观察，不写“调用draw即60FPS”测试。
- [ ] Run: `npm run test --workspace study-room-frontend -- stageBackgroundLifecycle.test.ts audioGraph.test.ts`；前端typecheck通过后提交。

## Task 8：原生八向轮盘及按住／释放

**Files:** `desktop/src/renderer/wheel.html`、`wheel.css`、`wheel.js`、`desktop/src/main/music/desktopWheel.ts`、`wheelProtocol.ts`；Test `desktop/test/wheelProtocol.test.ts`、Create `frontend/e2e/desktop-wheel-renderer.spec.ts`。

- [ ] SVG绘制深浅环形底座、细分隔线、带内圈的中心圆盘、八个方向渐隐光晕。每个方向45°，斜角与正方向使用相同外延半径；常驻图标，无长文字，中心显示当前名称。
- [ ] renderer视觉参数与主进程命中参数使用同一geometry定义／生成数据。中心死区、图标半径、窗口大小按DIP缩放；调整窗口范围时同步本地呼出原点，屏幕边缘不偏移命中。
- [ ] 展开120ms、选中80–100ms和1.18倍图标放大，减少动态关闭缩放。悬停只更新旧／新两个方向，不重画整窗；renderer继续禁止任意导航及新窗口。
- [ ] hook sequence保持OPEN/MOVE/RELEASE/CANCEL身份绑定。释放任一修饰键执行一次，重复RELEASE和旧sequence忽略；中心、Esc、右键、窗口销毁取消，不偷偷执行上次选中命令。
- [ ] 扩展测试覆盖8个中心角／边界角、DPI原点、陈旧sequence、取消后迟到release、最小化恢复和禁用状态。Run: `npm run test:unit --workspace study-room-desktop -- wheelProtocol.test.ts`；renderer浏览器用例核对SVG8向、中心标签和键盘可读名称。
- [ ] 生成实验包后使用实体键盘逐向测试；浏览器鼠标点击不计作原生按住／释放通过。提交本任务源码与必要测试。

## Task 9：透明桌面歌词渲染与控制

**Files:** `desktop/src/renderer/lyrics.html`、`lyrics.css`、`lyrics.js`、`desktop/src/preload/lyrics.ts`、`desktop/src/main/music/lyricsProtocol.ts`、`desktopMusic.ts`；Test `desktop/test/desktopLyricsWindow.test.ts`、`lyricsProtocol.test.ts`、`frontend/e2e/desktop-lyrics-renderer.spec.ts`。

- [ ] 透明底／轻描边／阴影取代卡片；默认仅歌词，悬停或键盘焦点展示紧凑图标工具栏。删除常驻播放中／暂停文字，但保留独立错误提示。
- [ ] 工具栏命令精确白名单：播放、上／下一首、锁定、打开客户端歌词设置、关闭。解锁由可信主窗口／托盘操作；锁定浮窗显示必要解锁提示，不因穿透导致不可找回。新IPC动作必须在main/preload/protocol同时校验，禁用自由URL和路径。
- [ ] 应用原色、highlight、fontFamily、fontSize、rows、opacity、smoothScroll。原色用于未高亮及下一句；有words才逐字高亮。opacity只影响歌词内容，工具栏维持可读。
- [ ] 相邻行平滑向上切换，seek或jump直接定位；只预热下一句和测量变化文字。长句先缩小至可读最小字号，再受控滚动；减少动态静态截断并可查看完整句。
- [ ] 位置恢复继续限制workArea；移除显示器／DPI改变后重夹紧。main减少无变化frame发送，renderer隐藏时停RAF；恢复按收到的新位置计算，不重放积压帧。
- [ ] Run: `npm run test:unit --workspace study-room-desktop -- desktopLyricsWindow.test.ts lyricsProtocol.test.ts`，配合renderer浏览器用例检查透明底、toolbar显示、无word时无假wipe、异常可见、原色与不透明度。
- [ ] 实验包验证原生置顶、透明、穿透、锁定／解锁、找回、多屏DPI和轮盘切换歌词。通过才记原生验收；提交代码。

## Task 10：完整集成、性能与回归

**Files:** 上述相关测试、`docs/superpowers/specs/2026-10-29-listening-stage-client-controls-design.md`；Create `docs/verification/2026-10-29-listening-stage-client-controls.md`（仅脱敏结果，不上传截图／日志）。

- [ ] 执行 `npm run typecheck`、`npm test`、`mvn -f backend/pom.xml test`、`npm run build:web`、`npm run build:desktop-candidate`。每项记录实际退出码和提交，不预填通过数量。
- [ ] 执行 `npm run check:identity-boundaries`、`npm run check:provider-boundaries`、`npm run check:secrets`，确认网页未打包平台登录能力、窗口IPC仍精确校验、未增加凭据外传。
- [ ] 浏览器定向命令：`npm run test:e2e --workspace study-room-frontend -- client-music-settings.spec.ts listening-stage-polish.spec.ts sound-stage-persistence.spec.ts desktop-lyrics-renderer.spec.ts desktop-wheel-renderer.spec.ts immersive-selects.spec.ts`。新spec文件由前述任务创建，禁止跳过或删除失败断言。
- [ ] 使用1440×900、1280×720、1080×640、390×844核对布局、控制台、键盘和减少动态；八向柔光与透明歌词对照已确认预览。截图仅留私有验收目录。
- [ ] 在同一曲目验证声音页／舞台／桌面歌词位置一致；音乐和白噪音独立音量；暂停、seek、换曲、错误、最小化和恢复。平台歌曲仅使用有效授权账号，不用越权音源补验。
- [ ] 分别记录频谱／声波／星云渲染耗时、隐藏前后RAF、背景切换后资源与下一句预热情况；不承诺固定FPS，不用一次截图代替性能观察。
- [ ] 新实验安装包固定独立版本和源码，保留用户数据，不覆盖正式目录。实体键盘、真实音频／原生透明、多DPI与真实更新分别记录证据；缺失的项目保留未验证。
- [ ] 更新验收记录：已修改、已验证、失败／未验证、下一步；没有生产部署授权时不运行发布脚本、不改变更新策略。正式发布须同步安装包、下载页、更新日志和公私库源码／发布记录，并核对固定版本与SHA-256。

## 计划自检结果

- 规格1–2对应Task5–7；规格3对应Task2–4；规格4对应Task5、9；规格5对应Task2–4、8；规格6对应Task1；架构／性能与验收边界对应Task5–10。
- 预览模拟信号、故障演示按钮、页面内浮窗不进入产品；旧账号／媒体／存档不参与公开证据。
- Task1–2源码与测试已完成；Task3主进程部分已实现，前端草稿隔离仍待完成；Task4–10未执行。执行方式选当前会话按顺序实施，完成阶段后更新实际状态，不额外创建线程或子代理。
