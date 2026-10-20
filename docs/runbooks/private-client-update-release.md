# 私有客户端发布运行手册

## 当前状态

受保护服务器源和 GitHub v2 传输均已有实现与隔离测试，生产自动推送仍默认关闭。GitHub 新流程、公开下载边界、签名配置和引导版验收见 [GitHub 更新手册](github-client-updates.md)。本页保留服务器源操作步骤，不代表生产已启用，也不授权改动系统信任。

## 隔离测试发布

1. 在仓库外的受限位置生成 Ed25519 密钥；私钥不进入仓库、服务器、构建缓存或安装包。
2. 本轮明确使用 `manifest-signed` 未签名安装包，在 Windows 沙盒测试，不导入系统信任证书。旧 `trusted` 模式仍需真实受信任的 Authenticode 配置，不混用两种模式。
3. 设置 `STUDYROOM_UPDATE_API_BASE_URL`、`STUDYROOM_UPDATE_ORIGIN` 和 `STUDYROOM_UPDATE_PUBLIC_KEYS_JSON` 指向隔离 HTTPS 环境。
4. 对已审核的干净提交执行 `scripts/publish-client-update.ps1 -TrustMode manifest-signed -Channel beta -Version 0.1.1-beta.1 -PrivateKeyPath <仓库外私钥> -KeyId <内置公钥标识> -DryRun`。CI 候选优先使用现成制品核对后本机签清单；此脚本的非 DryRun 会导入服务器，验收前不要执行。
5. 记录安装包、`latest.yml`、blockmap、`release.json` 和签名文件的 SHA-256，并保存 Git 提交号。

## 阶段 12 生产启用检查点

- 明确信任模式。`trusted` 必须通过 Authenticode；本轮 `manifest-signed` 必须通过内置 Ed25519 清单和实际未签名 A/B 升级门禁，不能伪称受信任签名。
- 复验服务器 2C2G 资源、磁盘空间、备份和回滚路径。
- 在 Nginx `http` 上下文引入 `study-room-updates-http.conf`，在站点 `server` 中引入 `study-room-updates.conf`；安装内部导入脚本，密钥文件权限为 root-only。
- 在后端部署配置中加入 Ed25519 当前/下一把公钥与随机导入密钥。
- 仅本人试投放，完成实际版本升级和本地数据保留；按当前已批准计划，在所有门禁通过后才能启用生产，再人工分阶段扩大稳定通道受众。
- 定时清理前由控制面导出当前版、待安装版和管理员标记回滚版到 `/etc/studyroom/update-protected-releases`；`prune-client-updates.sh` 默认只预览，复核后才带 `--apply`。

## 事件处置

- `PAUSED`：临时停止新检查和下载，保留恢复能力。
- `WITHDRAWN`：撤回错误版本；随后发布更高版本修复包。
- 白名单撤销：立即断开该用户推送；Nginx 的后续鉴权请求也会失败。
- 签名或哈希失败：保持当前版本可用，冻结通道并检查发布工作站与存储完整性。
