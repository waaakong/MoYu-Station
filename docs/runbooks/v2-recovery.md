# StudyRoom v2 恢复手册

本手册用于 Electron v2 开发和发布期间的故障恢复。所有恢复命令默认由服务器 root 执行；生产恢复前必须明确维护窗口、目标备份和回退负责人。

## 1. 当前恢复点

- Git 标签：`v1-baseline-2026-09-12`
- 服务器备份：`/opt/study-room/backups/v1-baseline-20260912T170743+0800`
- 备份内容：数据库、上传目录和完整 Git bundle。

不要修改该目录中的文件。保留 root-only 权限，并将 `SHA256SUMS` 作为完整性依据。

## 2. 恢复前检查

1. 确认目标路径解析到 `/opt/study-room/backups/v1-baseline-*`。
2. 在备份目录运行 `sha256sum -c SHA256SUMS`。
3. 分别运行 `gzip -t study_room.sql.gz`、`tar -tzf uploads.tar.gz` 和在 Git 仓库上下文中运行 `git bundle verify source.bundle`。
4. 记录当前数据库、上传目录、JAR、前端目录和服务状态。
5. 未获得数据覆盖确认时，只能恢复到隔离目录或隔离数据库。

## 3. 隔离恢复演练

数据库演练使用单独的 `study_room_restore_check` 库，不覆盖生产库：

```bash
mysql -e "CREATE DATABASE study_room_restore_check CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
gzip -cd study_room.sql.gz | sed 's/`study_room`/`study_room_restore_check`/g' | mysql study_room_restore_check
mysql -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='study_room_restore_check'"
```

上传和源码恢复到新的临时目录，核对数量与 Git 提交后再删除演练副本。演练不得让 Nginx、systemd 或生产环境变量指向这些目录。

## 4. 应用回滚

应用发布必须先保存上一版 JAR 与前端目录，再使用同文件系统内的原子重命名切换。出现以下任一情况立即回滚：

- 服务连续三次启动失败。
- 健康检查非 200 或关键接口持续 5xx。
- WebSocket 无法建立连接。
- 内存、swap 或磁盘水位超过发布阈值。

回滚顺序：进入维护页、恢复上一版 JAR 与静态目录、重启 `study-room`、执行 `nginx -t`、恢复 Nginx、验证 API/首页/WebSocket，再解除维护页。

## 5. 数据回滚

数据库或上传目录回滚属于破坏性操作，必须在用户再次明确确认后执行：

1. 停止写入并记录当前状态。
2. 再备份当前数据库和上传目录，禁止直接覆盖唯一副本。
3. 将基线数据恢复到新的数据库和新的上传目录。
4. 完成表数量、账号、文件数量和抽样哈希校验。
5. 通过环境变量和原子目录切换指向恢复副本。
6. 验证后保留故障现场，等待根因分析。

## 6. 发布健康检查

```bash
systemctl is-active study-room nginx mysqld redis
nginx -t
curl --fail http://127.0.0.1:8080/api/auth/me
curl --fail -H 'Host: moyustation.xyz' http://127.0.0.1/
```

认证接口可以返回业务层未登录状态，但 HTTP 链路必须可用。发布结果、版本、时间、资源峰值和回滚点必须写入发布记录。
