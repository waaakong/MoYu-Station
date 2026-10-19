# 屿光 · Island Light

本项目原创矢量标识：拱窗、岛屿轮廓与一条短倒影。并非 Apple 系统图标或 SF Symbols 的复制品。

- 母版：`island-light.svg`；界面无底板版本：`src/components/icons/BrandMark.vue`。
- 构建：仓库根执行 `node frontend/scripts/build-brand-icons.mjs`。
- 网页：SVG favicon、32 px PNG、180 px touch icon，另备 192／512 px PNG。
- 桌面：16／20／24／32／40／48／64／128／256 px PNG 与多尺寸 ICO。
- 16／20 px 及 SVG favicon 省略倒影，保留主要轮廓。
- 原创功能图标在 `src/components/icons/paths.ts`；游戏牌面、木鱼、场景和用户图片不属于此图标替换范围。

当前是本地候选资源接入。任务栏／快捷方式的系统缓存、正式签名安装包及实际安装后的多 DPI 检查仍须发布验收，不能只凭源文件验证宣称已覆盖正式客户端。
