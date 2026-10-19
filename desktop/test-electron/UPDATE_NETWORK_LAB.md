# 隔离更新通知验收

从 desktop 目录运行 `npm run test:update-network`。依赖已安装的 Electron、esbuild 和 Git 附带 OpenSSL；可用 `STUDYROOM_TEST_OPENSSL` 指定 OpenSSL 的绝对路径。

运行器启动隐藏 Electron，使用新建临时用户目录、127.0.0.1 HTTPS/WSS 服务和测试账号夹具。TLS 仅在测试 session 中按生成的证书指纹、IP 与有效期精确放行，先验证未信任 session 拒绝连接；不导入主机证书、不连接生产。

每次输出证据目录，其中 result.json 为断言结果，process.log 为诊断。进程最多运行 60 秒。临时 TLS 私钥仅供回环测试，不应上传。业务数据为夹具，不能代替真实后端、账号权限或撤销验收。

安装始终禁用：此测试不下载或执行安装包，不更改正式客户端。真实覆盖安装、重启和旧数据保留需要另行确认的隔离 Windows 环境与可验证签名制品；缺失时保持阻断，不关闭签名或 TLS 校验。
