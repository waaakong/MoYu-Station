# 墨屿开发者指南

维护日期：2026-10-19。面向开发者、部署维护者和贡献者；用户安装说明见[项目首页](../../README.md)。本文不是私密文档，仓库公开后同样公开，不保存生产凭据或私人验收材料。

## 代码与当前状态

- 主分支为 `main`，不再使用旧文档中的重构分支。以实际 Git 提交、构建配置与发布记录固定制品，不从整棵脏工作区盲目打包或提交。
- npm workspaces 包括 `frontend/`、`desktop/`、`packages/contracts/`；后端在 `backend/`，部署模板在 `deploy/`。
- 自有源码及文档按 [MIT](../../LICENSE) 授权，第三方和媒体边界见 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。源码开放不能代替素材权利证明或平台授权。
- GitHub 精确 Release 更新、取消／重试、签名清单、受控回源和安装前复核已有实现。普通构建默认不启用自动安装；无受信任 Authenticode 配置时保留手动下载。
- 2026-10-19 已允许安装包公开分发；实际仓库可见性、Release、生产更新及下载页须分别核实，不能将本地实现写成已上线。
- 历史阶段报告仅代表当时记录，不作为当前版本、迁移或验收状态的自动证明。

## 架构与信任边界

Vue 3／Pinia／Router 同时支撑网页与 Electron Renderer。桌面经精确 IPC 使用 SQLite、曲库、音频、托盘和独立 Provider 进程；Java 17／Spring Boot 后端提供账号、MySQL、Linux Redis Session、限流、WebSocket、媒体与审计。

Renderer 不获得任意路径、任意 SQL、平台 Cookie 或任意网络代理。业务接口变更须同步 DTO、共享类型、前端 API、Electron 精确白名单与能力声明。大整数 ID 用十进制字符串传输。

## 开发环境

Node.js >=22.12.0、与 lockfile 兼容的 npm 10、JDK 17、Maven、MySQL 8、Redis 6.2+。真实 MySQL 集成测试需要 Docker／对应测试环境；跳过不算通过。Windows x64 用于 Electron 安装验收。

从已审核提交运行：

```powershell
npm ci
```

创建独立空数据库，通过环境变量设置连接、密码、Redis 和至少 32 字节随机邀请码 pepper。不要复用生产库、生产会话或公开固定密码。

```powershell
$env:STUDYROOM_DB_USERNAME = 'studyroom'
$env:STUDYROOM_DB_PASSWORD = '<local-database-password>'
$env:STUDYROOM_INVITATION_PEPPER = '<random-value-at-least-32-bytes>'
mvn -f backend/pom.xml spring-boot:run
```

另开终端启动网页，默认本机 5173，后端代理默认 8080：

```powershell
$env:VITE_DEV_TUNNEL = 'false'
npm run dev --workspace study-room-frontend
```

不要将开发服务器、HMR 或开发代理暴露至公网。Electron 使用本地网页构建，云端绑定精确 HTTPS Origin，不关闭证书验证：

```powershell
npm run build:desktop-candidate
npm start --workspace study-room-desktop
```

## 数据库与统计

- `backend/src/main/resources/db/migration/` 为基础迁移 V1–V4；`db/media-migration/` 为显式启用的媒体及业务迁移 V5–V16。默认 Flyway 仅扫描基础位置；已有生产库不得套用开发默认配置。
- 实施时先读取真实 Flyway 历史与配置，再顺延版本。不改已应用迁移，不自动 baseline、clean 或重建已有数据库。
- 迁移前备份数据库、媒体与配置，并恢复到隔离位置演练。生产运行账号不长期持有 DDL 权限。
- 摸鱼 = 在线 − 专注；完整日期的假努力指数 = `(专注时长 + 2 × 摸鱼时长) / 在线时长`，保留两位小数。在线为零或历史不完整时不可用。
- 日期采用 `Asia/Shanghai`。离开空间暂停专注，暂停计入在线未专注；不伪造历史缺失值。
- 云端身份故障失败关闭，本地空间不被 Redis／网络阻塞。清理任务和实验能力不能因代码发布自动开启。

## 构建与配置

```powershell
npm run build:web
npm run check:web-production
npm run build:desktop-candidate
npm run package --workspace study-room-desktop
mvn -f backend/pom.xml -DskipTests package
```

使用 `STUDYROOM_RELEASE_VERSION` 明确制品版本，不把开发占位版本冒充生产版本。桌面云端配置 `STUDYROOM_CLOUD_ORIGIN`、`STUDYROOM_DESKTOP_ORIGIN`、`STUDYROOM_UPDATE_ORIGIN`、`STUDYROOM_UPDATE_API_BASE_URL` 必须与可信 HTTPS 入口一致。网页生产使用同源 API，不打包桌面平台能力或凭据。

默认值见 [application.yml](../../backend/src/main/resources/application.yml)、[features.ts](../../frontend/src/config/features.ts) 和[签名配置](../../desktop/scripts/update-signing-config.cjs)。平台能力须满足构建门、Main、单平台能力开关及用户确认；源码公开不自动开启实验接入。

## 测试

```powershell
npm run check:secrets
npm run check:assets
npm run typecheck
npm test
npm run test:e2e:functional --workspace study-room-frontend
npm run test:update-network --workspace study-room-desktop
npm run smoke --workspace study-room-desktop
mvn -f backend/pom.xml test
```

模拟接口不代替真实双端、数据库、安装或硬件验收。跳过的 Testcontainers、缺失设备、证书和观察证据必须明确列出。账号、私钥、截图、日志、用户库、媒体备份和缓存不入库。

公开仓库不包含历史截图和视觉基线。其 CI 视觉任务默认跳过（不是通过）；维护者审查并生成安全基线后才能设置 `MOYU_VISUAL_BASELINES_READY=true`。单元测试、构建及功能 E2E 保留。

## 更新与发布

见 [GitHub 更新手册](../runbooks/github-client-updates.md)、[服务器源更新手册](../runbooks/private-client-update-release.md) 和 [Flyway 恢复手册](../runbooks/flyway-baseline.md)。

每次正式客户端发布必须同时固定源码／配置／版本及摘要、备份并验证后覆盖原安装目录、同步下载页制品与日志、同步 GitHub 并核对远端。四项未全部成功，不宣称完整发布。保持原应用身份和用户数据；不强制结束正在运行的客户端。

GitHub 托管精确版本资产，墨屿控制面决定通道、灰度与撤回，不盲从 latest。公共资产不受墨屿登录限制。Ed25519、文件摘要和 Authenticode 不能相互冒充，不把未签名试用写成受信任自动安装。

生产变更先列目标、维护窗口、迁移、备份、健康检查和回退条件。失败即停止后续推广；应用／配置回退与数据恢复分开，不用旧库覆盖发布后的新增记录。

## 贡献与安全

说明贡献来源与许可，保留上游署名；不提交 GPL／AGPL 平台实现或其改写，不提供会员／DRM 绕过。开放源码不等于开放注册或授权清理用户数据。

安全报告见 [SECURITY.md](../../SECURITY.md)，不要公开凭据、私人媒体或可直接攻击生产的细节。
