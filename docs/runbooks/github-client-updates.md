# GitHub Release 更新操作手册

## 已实现、尚未启用

客户端根据墨屿控制面返回的授权版本下载，不直接跟随 GitHub 的 latest。签名清单 v2 包含仓库、精确 `v<version>` 标签、文件名、长度及 SHA-512；v1 服务器源保持兼容。后台默认关闭 GitHub 下载和生产推送。网页不执行客户端更新，也不保存平台凭据。

本实现参考 lolPing 的“检查→提示→用户下载→进度／取消→用户安装”交互；仍使用本项目的身份、活动保护和双重校验。正常退出不静默安装，安装前重新查询控制面，忙碌、未保存草稿、撤回、改版、退出或授权过期均阻止旧安装器。

## 两个独立前置条件

1. **文件分发边界**：公共 GitHub Release 资产可绕过墨屿登录直接下载。用户已于 2026-10-19 明确批准安装包公开下载、声明内置图像为本人原创，并批准另建 `waaakong/MoYu-Station` 无旧历史公开仓库；原 `waaakong/StudyRoom` 私库及历史保持不变。手动公开下载不等于自动安装授权通过；服务器备用下载继续登录限定，不往客户端塞私有仓库 token。
2. **签名**：部署受信任 Authenticode 证书，配置 publisher、SHA-1 指纹和 RFC3161 时间戳。Ed25519 清单是独立的内容完整性校验，不能代替 Windows 发布者信任。缺失时只允许已有手动下载流程，不自动导入信任根。

## 构建和草稿

- 对明确的已审核提交创建不可变版本标签；不要从脏工作树或未固定依赖构建。稳定通道支持正式 SemVer 和现有 `-trial.YYYYMMDD.N` 版本；Beta 使用 `-beta.N`，实验通道使用 `-exp.N`。
- 准备 `docs/releases/<version>.md`：写明交付、验证、限制和未验证项目，不写凭据或私人测试内容。
- GitHub Actions `desktop-release.yml` 仅手动触发，且仅创建草稿；它不会发布 Release、激活服务端策略或部署生产。
- 使用受保护环境 `moyu-release-draft`，仅允许可信维护者审批；专用 Windows 签名 runner 标签为 `moyu-signing`。不可运行来自外部 PR 的代码。先配置合法证书及 Ed25519 私钥的受限本机文件权限，不把私钥内容放入仓库。
- 环境变量：`MOYU_SIGNING_PUBLISHER`、`MOYU_SIGNING_CERT_SHA1`、`MOYU_SIGNING_TIMESTAMP_URL`、`MOYU_MANIFEST_KEY_PATH`、`MOYU_MANIFEST_KEY_ID`、`MOYU_MANIFEST_PUBLIC_KEYS_JSON`。批准公共下载后才设置 `MOYU_ALLOW_PUBLIC_INSTALLERS=true`。
- 稳定构建不会因此自动开启实验音乐平台；若需实验通道，另行审核对应能力配置，不能借更新渠道绕过能力授权。
- 工作流验证源码标签、签名／时间戳、feed 与安装器一致、文件摘要，上传后再从草稿资产 API 下载逐字节核对。已有 Release 一律失败，不使用 `--clobber`。失败时保留草稿调查，不继续发布。
- 本地可用 `create-update-release.mjs --channel ... --version ... --directory ... --private-key ... --key-id ... --github-repository waaakong/MoYu-Station` 生成清单，再运行 `verify-update-release.mjs --directory ... --public-keys-json ...` 校验。不提供 GitHub 参数即生成兼容 v1。

## 验收和启用顺序

1. 在隔离 Windows 环境安装引导版（旧客户端不会自动获得新配置），确认应用 ID、原安装目录及用户数据路径未改变。任何测试证书只在该环境信任。
2. 记录旧版本的数据摘要、曲库、队列、全部游戏存档和偏好；完成下载、取消、重试、授权过期、退出、撤回、错误哈希／签名、断网、429、磁盘不足及安装失败测试。
3. 用户主动安装后检查新进程的实际版本、路径、登录和数据摘要。模拟状态机和 loopback HTTPS 测试不能替代此项。
4. 公共分发及签名门禁满足后人工复核草稿。公开 Release 后不可改写同版本文件；错误版本撤回并发布新版本。即使 GitHub 文件被替换，客户端仍须符合原签名清单，否则拒绝安装。
5. 保留服务器本地完整校验副本，依原流程导入为 DRAFT。服务端配置 `github-repository=waaakong/MoYu-Station`，签名门禁满足并明确批准后才开启受控更新的 GitHub 下载。先发布控制面和手动安装引导版，再对指定测试成员逐级开放 PILOT／ROLLING／FULL。现有通道成员权限不自动扩大成所有注册账号。
6. GitHub 网络故障、404、429 或 5xx 时仅回源同版本同摘要的服务器副本；取消、401／403、哈希、签名或域名阻断不以回源绕过。完整安装器下载关闭差分，避免读取未授权旧版 blockmap。
7. 每次正式客户端发布仍须同步下载页、安装包元数据、更新日志与 GitHub 源码记录。已发布的公开手动包通过 `release.publicDownloadUrl` 精确绑定仓库、版本及文件名；没有该字段时不推测链接。服务器备用下载保留登录权限。

## 撤回和回退

暂停或撤回控制面版本会停止新授权；客户端安装前再次查询，拒绝撤回／替换版本。已公开 GitHub 文件本身无法通过墨屿权限收回，应在 GitHub 处理错误资产并发布更高版本。退出不会偷偷安装缓存制品。

回退应用二进制与数据库／用户数据分开处理，不用旧数据备份覆盖升级后的新增记录。保留备份和隔离恢复证据后才正式覆盖安装。
