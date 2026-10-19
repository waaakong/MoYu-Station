# 私有客户端发布运行手册

## 当前状态

受保护服务器源和 GitHub v2 传输均已有实现与隔离测试，生产自动推送仍默认关闭。GitHub 新流程、公开下载边界、签名配置和引导版验收见 [GitHub 更新手册](github-client-updates.md)。本页保留服务器源操作步骤，不代表生产已启用，也不授权改动系统信任。

## 隔离测试发布

1. 在离线位置生成 Ed25519 密钥；私钥和测试 PFX 不进入仓库、服务器或安装包。
2. 在隔离 Windows VM/发布机安装一次性测试 CA，确保测试安装包拥有可验证的签名。
3. 设置 `STUDYROOM_UPDATE_API_BASE_URL`、`STUDYROOM_UPDATE_ORIGIN` 和 `STUDYROOM_UPDATE_PUBLIC_KEYS_JSON` 指向隔离 HTTPS 环境。
4. 执行 `scripts/publish-client-update.ps1 -Channel beta -Version 0.1.1-beta.1 -PrivateKeyPath <离线私钥> -KeyId test-2026 -DryRun`。
5. 记录安装包、`latest.yml`、blockmap、`release.json` 和签名文件的 SHA-256，并保存 Git 提交号。

## 阶段 12 生产启用检查点

- 取得受信任 Authenticode 证书并启用发布者校验。
- 复验服务器 2C2G 资源、磁盘空间、备份和回滚路径。
- 在 Nginx `http` 上下文引入 `study-room-updates-http.conf`，在站点 `server` 中引入 `study-room-updates.conf`；安装内部导入脚本，密钥文件权限为 root-only。
- 在后端部署配置中加入 Ed25519 当前/下一把公钥与随机导入密钥。
- 仅管理员试投放，完成 0.1.0 → 更高版本升级和本地数据保留验证。
- 经用户再次确认后，才可将生产开关设置为 true。
- 定时清理前由控制面导出当前版、待安装版和管理员标记回滚版到 `/etc/studyroom/update-protected-releases`；`prune-client-updates.sh` 默认只预览，复核后才带 `--apply`。

## 事件处置

- `PAUSED`：临时停止新检查和下载，保留恢复能力。
- `WITHDRAWN`：撤回错误版本；随后发布更高版本修复包。
- 白名单撤销：立即断开该用户推送；Nginx 的后续鉴权请求也会失败。
- 签名或哈希失败：保持当前版本可用，冻结通道并检查发布工作站与存储完整性。
