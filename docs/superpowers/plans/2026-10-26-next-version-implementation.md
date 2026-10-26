# 墨屿下一版本实施计划

> For agentic workers: 在当前会话用 executing-plans 顺序执行；用户已明确要求最终只保留 main。提交身份 WaaaKong。每个阶段有独立验收证据，原生及平台测试不能用模拟替代。

**Goal:** 交付无编号 6×6 拼图、中文反馈状态、全局手势轮盘、上滑桌面歌词，修复经过证实的安全及酷狗授权兼容问题。

**Architecture:** 延续共享契约、受限主进程 IPC、独立歌词窗口和平台 worker；轮盘增加固定打包的 Windows 输入辅助进程。音乐状态统一来自既有播放器。

**Tech Stack:** Vue、TypeScript、Electron、Windows C++、Java/Spring、Vitest、Playwright。

## 1. 游戏与反馈

- [ ] 在 `packages/contracts/test/games.test.ts` 添加 6×6 36块、交换解题、存档验证、拒绝尺寸5的断言；先运行契约测试确认失败。
- [ ] 修改 `packages/contracts/src/games.ts` 的 PuzzleGame/newPuzzle 尺寸联合和 isClassicGame 尺寸验证；保持旧存档版本1。生成器运行时拒绝非法尺寸。
- [ ] 修改 `frontend/src/pages/entertainment/ClassicGameTool.vue` 添加6×6选项及工厂分支，移除 span 编号；aria-label 只保留当前位置和选择状态。修改 EntertainmentHub 描述。
- [ ] 修改 `frontend/src/pages/admin/AdminFeedbackPanel.vue`，保持 option value 原始枚举，文字映射待处理／处理中／已记录／已解决。保持版本冲突与本人复验流程。
- [ ] 执行 `npm run test --workspace @studyroom/contracts`、前端类型与定向游戏验收，提交本阶段文件。

## 2. 安全整改

- [ ] 在 `desktop/test/security.test.ts` 验证凭据URL、非标准端口和超长URL均被拒绝；保持合法 HTTPS 地址通过。按测试修复 navigation.ts。
- [ ] 核对生产代理拓扑后调整单入口 proxy-headers.conf，后端只取可信来源；隔离测试覆盖伪造首项、IPv6与无头。不得直接修改生产网络。
- [ ] 为 `desktop/src/audio/library/metadata.ts` 引入可终止的解析进程边界；固定工作程序、最大并发／时间／输入／输出，超时终止而非仅 Promise.race。测试真实超时回收和正常标签／歌词兼容。
- [ ] 分组核对上游公告与依赖锁，升级存在风险的实际依赖，执行受影响单测、类型和构建。后端有效依赖扫描单列结果，不自动更换Spring大版本。

## 3. 桌面歌词

- [ ] 扩展 contracts/src/desktopMusic.ts、主进程 schema 和设置兼容默认值；测试旧设置无损读取与非法外观参数拒绝。
- [ ] 修改桌面歌词主进程、受限 preload 和 renderer：透明窗口、上滑280ms、可取消动画、悬停控件、锁定、设置与托盘解锁、多屏边界。
- [ ] 扩展歌词解析为受限的真实逐字数据，普通LRC只整句；测试乱序、错误时间、空歌词、切歌迟到回包和偏移。位置跳转立即定位。
- [ ] 从 player 统一发布曲目身份、序号、位置、时间段及外观，歌词窗口不自行播放或取平台凭据。隐藏时停止发布。
- [ ] 修改 DesktopMusicControls.vue 提供字号／颜色／行数，测试类型及浏览器预览。真实窗口穿透和播放同步在Windows测试机验收。

## 4. 全局轮盘

- [ ] 原生输入辅助进程仅监听配置组合及操作会话，不记录普通输入；状态Idle／Active／Cancelled，释放单次执行，Esc／中心／右键取消，断连fail-open。
- [ ] Electron轮盘独立窗口和preload，有限八项命令，不接受URL／脚本／自由路径；显示在光标所在屏幕并夹紧。
- [ ] 用户设置控制启用、快捷键、唯一操作排序及全屏例外；校验失败回滚。更新构建脚本，将固定helper纳入打包和边界检查。
- [ ] 测试状态机、消息长度／序号、进程退出、非预期sender、快捷键冲突与取消；Windows实测最小化、多DPI和原输入恢复。

## 5. 酷狗VIP

- [ ] 在同一真实登录账号比较周杰伦《晴天》的准确歌曲ID及API权限字段，不写入凭据／完整媒体URL；先保存脱敏字段结论。
- [ ] 补充“账号已授权但版权元数据非零”的失败测试，再修复真实已证明字段语义；保留试听限制、过期会话、身份绑定和媒体地址安全验证。
- [ ] 复验免费歌曲、VIP完整歌曲、无VIP拒绝、试听、退出重登和缓存失效，未取得真实授权响应时保留阻断，不盲目放宽。

## 6. 汇总门禁与交付

- [ ] 执行类型、契约、前端／桌面单测、后端相关测试、web／desktop构建、敏感信息及身份／平台边界检查。
- [ ] 记录4种尺寸、键盘／减少动态、控制台；Windows原生与真实音乐复验单列，不冒充通过。
- [ ] 只提交本版文件。用户要求main归并且删除分支已完成，本版继续维护main，无强推或重写旧制品。
- [ ] 发布准备必须另有固定版本、源码／配置、安装包SHA256、下载页和更新日志，公私库同步核验；未完成不得宣称生产发布。
