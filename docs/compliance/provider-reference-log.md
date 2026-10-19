# 第三方音乐 Provider 参考与合规记录

更新时间：2026-09-15
用途：记录工程事实、来源、许可和放行条件；不构成法律意见

## 1. 来源登记

| 来源 | 类型 | 2026-09-15 观察结论 | 使用边界 |
| --- | --- | --- | --- |
| [TME 服务协议](https://www.tencentmusic.com/zh-cn/protocol.html) | 权利方官方 | 10.4 条限制未经授权第三方工具处理交互数据、登录或使用服务 | QQ/酷狗真实接入前必须取得授权 |
| [腾讯云 QQ 音乐 H5 SDK](https://cloud.tencent.com/document/product/1081/67456) | 腾讯官方 | 支持授权、歌单、搜索、推荐、歌词和播放，但运行在腾讯连连/IoT H5 场景 | 不能当作无条件公开 API |
| [腾讯云音乐服务 SDK](https://cloud.tencent.com/document/product/1081/68800) | 腾讯官方旧版文档 | 酷狗能力依赖设备 ID、产品和 TME 授权 | 仅在获得适用合作资格后评估 |
| [腾讯云酷狗歌单歌曲 API](https://cloud.tencent.com/document/product/1081/60551) | 腾讯官方 | 请求需要 AccessToken、DeviceId 和 `AppKugouUserCommand` | 当前 StudyRoom 不具备调用条件 |
| [酷狗官方登录页](https://www.kugou.com/newuc/login/weblogin) | 权利方官方 | 官方登录入口当前存在 | 不代表允许嵌入第三方应用 |
| [酷狗服务协议](https://activity.kugou.com/privacy/v-20e061b3/index.html) | 权利方官方 | 限制未经授权第三方工具登录、读取或处理服务数据 | 未获授权时保持 Provider 关闭 |
| [网易云官方登录相关页面](https://musicupload.netease.com/download) | 权利方官方 | 页面包含扫码/账号登录和官方条款入口 | 只证明官方登录产品存在 |
| [网易云官方服务条款入口](https://st.music.163.com/official-terms/service)及[2025-09-03 快照](https://archive.is/x6BJI) | 官方入口与留存快照 | 官方入口自动抓取不可用；快照显示禁止未经授权第三方兼容软件登录与处理交互数据 | 正式接入前需人工复核最新版并取得授权 |
| [Mineradio](https://github.com/XxHuberrr/Mineradio) | 第三方开源参考 | 核对 commit `328a087a14e79d5267a3de54d29108c34ed6cf60`，许可证 `GPL-3.0-only` | 只参考公开产品行为，不复制代码、常量、fixture 或实现 |

## 2. 已确认事实与未验证假设

### 已确认事实

- StudyRoom 当前没有网易、TME、QQ 音乐或酷狗的合作方凭据和书面授权记录。
- 当前仓库没有 Mineradio 源文件；临时参考克隆位于仓库之外，不进入 Git。
- QQ/酷狗官方合作能力存在，但当前找到的文档范围是物联网设备/H5 面板。
- 三个平台的会员、版权、地区和播放资格必须由平台真实结果决定。

### 未验证假设

- 普通网页登录 Cookie 可以合法地被 StudyRoom 捕获并用于私人 API。
- 面向消费者网页的非公开接口允许由分发给用户的第三方 Electron 应用调用。
- Mineradio 可用的接口会继续稳定或符合 StudyRoom 的分发场景。

这些假设在没有权利方授权前不得转化为生产代码或“已支持”宣传。

## 3. Clean-room 边界

允许：

- 记录用户可在公开界面观察到的功能名称和状态。
- 独立设计 ProviderAdapter、熔断、缓存、IPC、安全协议和 UI。
- 使用权利方正式提供且明确适用于 StudyRoom 的文档、SDK 和凭据。

禁止：

- 复制 Mineradio 的 Provider 文件、函数、常量、签名算法、接口映射、测试数据或注释。
- 根据 Mineradio 源码直接重写等价实现。
- 将 GPL 文件编译、打包或改名后加入 StudyRoom。
- 使用非官方接口规避平台会员、地区、版权、DRM、广告或官方客户端限制。

## 4. 当前 npm 许可证基线

`package-lock.json` 中有许可证字段的依赖共 511 个：

| 许可证族 | 数量 | 说明 |
| --- | ---: | --- |
| MIT | 390 | 既有依赖 |
| ISC | 37 | 既有依赖 |
| Apache-2.0 | 25 | 既有依赖 |
| BSD-2/3-Clause | 19 | 既有依赖 |
| MPL-2.0 | 12 | 既有依赖，后续发布审计保留 |
| LGPL 组合 | 14 | 全部来自 Sharp/libvips 多平台可选包 |
| 其他宽松/组合许可 | 14 | 0BSD、BlueOak、Python-2.0、WTFPL 等 |

阶段 6 尚未增加依赖。后续新增依赖必须记录名称、精确版本、直接/传递许可证、用途和是否进入分发包；不得引入 GPL/AGPL Provider 聚合实现。

## 5. 私人 Provider 放行证据

任一私人 Provider 从“关闭”改为“实验可用”前，必须同时具备：

1. 权利方书面授权、合作协议，或明确适用于第三方 Electron 产品的官方开发者条款。
2. 正式 SDK/API 文档及可用于 StudyRoom 的 client/product/device 凭据。
3. 数据使用范围、Cookie/令牌保存方式、用户同意和退出删除要求。
4. 音频播放、歌词、封面和歌单元数据的展示/传输授权边界。
5. 安全、真实账号和功能开关验收报告。

只有个人账号“能够登录”不构成上述放行证据。
