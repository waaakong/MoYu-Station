# 已批准更新规格的 Electron 传输修复

范围：修复正式本人试点的 UPDATE_NETWORK_FAILED，不改变账号资格、安装授权、签名、域名白名单、系统信任或用户任务等待规则。沿用用户已批准的一键更新规格；本记录解释底层适配修正，不新增产品范围。

直接证据：正式A=.20261024.1获取B=.2的真实GitHub offer后下载失败，未覆盖旧版。隔离Electron44.3.0进程的默认net.fetch和独立更新session.fetch均在现有redirect=manual调用返回“Redirect was cancelled”；同机原生HTTPS可回读同一已签名制品。当前模拟302测试不能证明Electron真的返回该Response。

实现：用net.request的manual redirect事件取回单跳状态及Location，立即结束旧请求，不调用followRedirect；既有fetchUpdateFeed循环验证Location后重新建立请求。每次请求明确omit cookies/session credentials。受保护服务器仍禁止重定向；GitHub仅限现有签名版本目录及既有CDN白名单，不发送应用令牌。响应体最多128KiB，取消/超时/迟到事件只结算一次；TLS验证照旧，不忽略证书错误。

其他路径：直接follow会失去逐跳凭据隔离；把“Redirect was cancelled”归为可降级网络错误只会掩盖GitHub主路径损坏。因此不采用这两种替代方案。

验证：单元覆盖原生302事件、取消和迟到事件、响应中断、过大响应及凭据选项；独立真实Electron HTTPS夹具证明取回302且不跟随目标；再以公开GitHub签名清单实际回读。已有生命周期测试保持原断言，状态机测试使用独立底层适配替身，不代替真实传输证据。新源码完整CI两轮/必要实机升级门禁仍须通过。

生产配置缺陷另行修复：private-updates曾复用聊天连接计数区导致503；恢复部署模板要求的studyroom_update_ip独立区，不放宽原2连接限制、权限或聊天规则。原失败保留。已发布.2不可改写，新包使用新版本，生产试点未通过前不扩大受众。
