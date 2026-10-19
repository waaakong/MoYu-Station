# Provider 禁用与本机清理手册

更新时间：2026-09-15
适用范围：阶段 6 开发、测试和未来发布候选

## 1. 目标

在平台接口变化、账号风控、凭据疑似泄露、许可证/条款不确定或安全测试失败时，立即停止对应 Provider，同时保留本地曲库、队列、声音设置、场景和专注数据。

## 2. 当前状态

截至阶段 6 工程完成版本：

- Renderer 原始凭据 IPC 已删除；界面只能请求 Main 打开受限登录窗口。
- 三个平台均有独立适配器契约和隔离 Worker，但真实能力因外部授权条件标记为“外部阻断”。
- 普通构建未嵌入实验许可，修改 Renderer 配置也不能启动 Provider Worker。
- 本机凭据文件为 Electron `userData` 目录下的 `provider-vault.json`，内容由 `safeStorage` 加密；当前被阻断的适配器不会写入真实平台会话。
- 服务端没有 Provider 搜索、登录、歌单或播放代理；只有按固定 station ID 的可选电台中继，默认关闭。

因此当前策略是保持 Provider 的构建许可、Main 总开关和三个单平台开关全部关闭，不向用户提供真实登录入口。

## 3. 目标功能开关

使用以下独立开关：

- `VITE_FEATURE_PROVIDERS`：私人 Provider 总开关。
- `VITE_FEATURE_PROVIDER_NETEASE`：网易云。
- `VITE_FEATURE_PROVIDER_QQ_MUSIC`：QQ 音乐。
- `VITE_FEATURE_PROVIDER_KUGOU`：酷狗。
- `VITE_FEATURE_PUBLIC_RADIO`：公开电台。
- `VITE_FEATURE_WEB_RADIO_RELAY`：网页电台中继，生产默认关闭。
- `STUDYROOM_EXPERIMENTAL_PROVIDERS`：构建时硬门；只有私人实验构建可设为 `1`。
- `STUDYROOM_PROVIDERS`：Electron Main 总开关。
- `STUDYROOM_PROVIDER_NETEASE`、`STUDYROOM_PROVIDER_QQ_MUSIC`、`STUDYROOM_PROVIDER_KUGOU`：Main 单平台开关。
- `STUDYROOM_PROVIDER_<平台>_<能力>`：Main 单能力开关；能力名为 `SEARCH`、`RECOMMENDATIONS`、`PLAYLISTS`、`FAVORITES`、`LYRICS` 或 `PLAYBACK`，默认全部关闭。
- `STUDYROOM_RADIO_RELAY_ENABLED`：服务端电台中继开关，生产默认关闭。

单个平台异常时只关闭它；凭据框架存在系统性问题时关闭总开关；公开电台独立处理。

## 4. 禁用流程

1. 记录触发原因、时间、应用版本、Provider 和脱敏错误码。
2. 将对应构建开关设为 false；远程 kill switch 上线后只能进一步关闭，不能覆盖用户本机关闭选择。
3. 停止新登录、搜索、歌单和播放解析请求。
4. 取消在途请求，失效该 Provider 的媒体 token，关闭其 Utility Process。
5. 当前正在播放的远端流停止并显示真实原因；只有高置信同版本且属于临时技术错误时才允许按用户顺序切源，权益、DRM、地区或版本不确定时禁止切源。
6. 验证本地曲库、环境音、公开电台及其他 Provider 仍可工作。
7. 发布修复前保持入口关闭，不用“网络波动”掩盖条款或授权问题。

## 5. 正常退出与清理

优先使用应用内“退出平台账号”：

1. 取消该 Provider 请求。
2. 失效该账号的媒体与封面 token。
3. 删除 `safeStorage` 中对应加密记录。
4. 清除临时 Session 的 cookies、cache、LocalStorage、IndexedDB 和 Service Worker。
5. 删除 schema v7 中对应账号作用域的元数据缓存。
6. 销毁 Provider Worker。
7. UI 收到 `signed-out` 后才显示退出成功。

清理任一步骤失败时显示“需要清理”，下次启动继续，不返回假成功。

## 6. 安全存储疑似泄露

1. 关闭私人 Provider 总开关并完全退出应用。
2. 不删除 `studyroom.sqlite`，其中包含本地曲库、队列、声音设置和专注数据。
3. 从应用日志或 Electron 运行信息确认精确 `userData` 目录，只对其中的 `provider-vault.json` 做隔离备份并从原位置移除；不要操作整个应用数据目录。
4. 重新启动应用，确认所有 Provider 为未登录且本地数据完整。
5. 建议用户在对应平台官方客户端撤销会话、修改密码并检查登录设备。
6. 分析日志时不得收集或要求用户发送 `provider-vault.json` 内容。

隔离备份包含敏感加密数据，只能本机保存，问题结束后安全删除，不能提交到 Git、工单或聊天。

## 7. 网页电台中继

- 中继代码即使存在也必须由服务端配置保持关闭，直到阶段 12 在 2C2G 环境完成并发和带宽验证。
- 出现 SSRF、域名劫持、带宽异常或未知站点跳转时立即关闭中继，不影响 Electron 本机电台和其他业务 API。
- 中继只接受已审计 station ID，不接受用户 URL；禁止转发网易云、QQ、酷狗音频。

## 8. 验证命令

```powershell
npm run check:secrets
npm run check:provider-boundaries
npm run typecheck
npm test
npm run build
mvn -f backend/pom.xml test
```

完成验证后记录：关闭的开关、退出/清理结果、本地曲库回归、是否需要用户重新登录，以及恢复开关必须满足的证据。
