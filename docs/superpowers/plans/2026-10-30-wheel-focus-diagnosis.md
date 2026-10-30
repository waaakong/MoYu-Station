# 轮盘前台失败取证

.112 与 .113 在“可见但被其他应用遮挡”时均失败；最小化恢复已由用户确认正常。暂不继续修改激活策略。

使用保留原行为的实验 .114，一次用户真实轮盘导航，收集：

- AllowSetForegroundWindow 返回的成功标志与系统错误码；仅观察配置手势 Ctrl／Alt 是否仍按住。
- 主窗口激活前、调用后及一次100ms后的可见、最小化、窗口焦点和页面焦点。
- 输入助手读取系统当前前台是否属于墨屿主进程及前台是否处于置顶层，不记录窗口标题或进程身份。

诊断由显式环境变量及实验可执行文件名双重限制，保存在实验 userData/diagnostics；白名单数字／布尔字段，最多128条及15分钟，不上传、不经渲染IPC访问。读取和写入失败不阻塞正常轮盘，不修改证书、权限或系统设置。新包核对后保留原实验数据启动，已有进程必须正常退出。实际证据取得后再选择修正，正式客户端和生产策略保持原样。

## 实际结果与对应修正

.114 复现取得 Win32错误5、Electron焦点true／系统前台false，以及另一修饰键未松开的状态。新 .115 不再将 Electron标志当作系统前台证据。由主进程在导航命令发送有限的 F+本次序号，原生助手只处理1.5秒内的同一实体手势和启动时核验属于实际父进程的主窗口。待配置手势键松开，调用原生前台API；必要时以 RAII 短暂关联输入线程，所有返回路径解除。新操作、前台改变、超时和不可用窗口均取消，不注入输入，不更改策略或常驻置顶。采用现有定时器在调用后读取系统真实前台，成功后仅补页面焦点。读取实验日志核对结果，实际Windows操作依用户复验；不使用单测代替。

接口依据：[AttachThreadInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-attachthreadinput)、[SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)、[SetFocus](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setfocus)。系统可拒绝跨桌面或不满足条件的请求，此实现不更改其安全边界。
