# DSH SSH 0.2.0 验证记录

真实 SSH 验证日期：2026-10-13（Asia/Shanghai）。发布前单元与界面回归复查：2026-10-14。
下文的 `dev-vm` 为已匿名化的测试主机别名，复现时替换为自己的 SSH 配置别名。

## 修复结果

- 左侧添加工作区与会话工作区选择器支持“本机 / SSH 虚拟机”、主机选择、图形目录浏览和工作区名称。
- VM 工程进入真实 DSH WorkspaceRegistry；原生工作区中新建的会话自动取得远端默认值，消息框保持空白。
- 相同远端目录复用工作区，绑定存储与单会话解绑可跨插件重载恢复。

- SSH 入口卡片与 DSH 自带卡片使用相同的尺寸、内边距、圆角、字号和主题色；亮色/暗色预览均已检查。
- 目录/文件新建对话继承当前工程，标题栏显示 SSH 目标，消息框保持空白。
- SSH 选择写入 DSH 存储域，系统提示词与 SSH 工具读取同一目标；重载后恢复且不会影响其他对话。

- 入口卡片使用当前标签的 `tab.actions.openTab`；全局回退传实际标签 ID。
- 移除主机行、文件浏览按钮引用外部 `setLastAction` 的错误和临时诊断代码。
- 页面请求使用 `api/ssh/...`，保留 POST、同源凭据和 DSH 原有认证。
- 目录与预览请求防止旧响应覆盖新选择；执行按钮防止快速重复提交。
- 终端保持挂载，输入按顺序提交，错误可见；跨块中文、输出尾部和会话关闭正确处理。
- 终端输出有保留上限，并发分配计入会话限额；取消轮询和卸载清理均有测试。
- 远端 glob 以数据方式处理模式；grep 保留错误退出状态；编辑拒绝截断或非 UTF-8 文件。
- 切换主机不继承另一台机器的目录；SSH Include、全局默认和通配默认进入主机目录。
- 空文件写入、严格参数与 base64 校验、二进制传输预算和 SHA-256 验证得到修复。

## 实际运行结果

| 验证 | 结果 | 验证范围 |
|---|---|---|
| `node --test tests/*.test.mjs` | 51 通过，0 失败，1 跳过 | 增加当前 DSH SlotRegistry/Cordis 激活、失败清理与卸载回归；其余覆盖 API、POSIX 进程、组件、远端选择和终端 |
| `node tests/ui-smoke.mjs` | 8 通过，浏览器错误 0 | Chromium、React DOM、真实 DSH SlotCore 注册校验、卡片尺寸、按钮和 xterm；服务接口模拟 |
| `node tests/integration-ui.mjs dev-vm` | 8 页面流程通过，2 认证检查通过，浏览器错误 0 | 真实浏览器 → DSH 认证/HTTP → SSH/原生 PTY |
| `node tests/integration-backend.mjs dev-vm` | 5 通过 | 注册工具的工作区、中文读写/编辑、1 MiB 二进制及 SHA-256、空文件、Linux 软链接 |
| `node tests/integration-terminal.mjs dev-vm` | 9 通过 | DSH 原生 PTY：中文、尺寸、多读者、长轮询、尾部输出、退出码、自然/主动关闭 |
| `node tests/integration-workspace.mjs dev-vm` | 5 通过 | 目录/文件图形标记与空白消息框、真实 SSH 默认路径与系统提示词、DSH 持久化及重载隔离、单会话解绑 |
| `node tests/integration-projects.mjs dev-vm` | 6 通过，浏览器错误 0 | 图形工作区选择器、真实 WorkspaceRegistry 与 SessionPersistence、新会话空白消息框、SSH 默认上下文、重复添加、重载与隔离 |

远端对话验证中，客户端会话创建/导航和模型执行由测试外壳替代；
Agent 注册、存储、提示词、认证和 SSH 使用真实 DSH 服务。未调用付费模型。
恢复测试发现存储域命名与异步恢复顺序不符合运行时契约，修复后完整重测通过。

单元测试中的软链接用例因 Windows 本地权限跳过；真实 Linux 软链接用例已通过。
原生终端的多读者测试最初因 shell 提示符与第一个标记在同一行而误判，
改为先输出换行后重跑，完整 9 项通过。

当前捆绑的 node-pty 在原生测试完成后仍保留 ConPTY 输出 worker 的 MessagePort，
导致独立 Node 进程不能自然退出。测试先验证 SSH 进程范围为零，并等待终端服务
及 DSH Context 清理完成，再显式结束其自身测试进程；没有修改应用的第三方依赖。

DSH 服务来自当前安装包的 **0.2.0-rc.2**，在独立测试 Context 中启动。
旧 profile npm 缓存中的 0.1.0-rc.6 不支持 Windows 终端，因此没有使用它充当桌面运行时。
测试服务器只监听 127.0.0.1，使用独立临时凭据目录和真实 DSH 认证；
未认证请求返回 401，跨站 Origin 返回 403。测试关闭后释放服务、PTY 和临时凭据目录。
远端测试只修改独立 `/tmp/dsh-ssh-test.*` 目录，已清理。

## 页面证据和边界

公开演示：[模拟终端界面](docs/images/ssh-panel.png)、[亮色入口](docs/images/guide-light.png)、[暗色入口](docs/images/guide-dark.png)。
真实主机截图及测试原始临时文件留在开发环境的 `artifacts/` 中，不随仓库发布。

真实页面流程包含：打开入口、选择主机、连接测试、执行命令并显示退出码、
文件刷新/上级/目录/文本预览、xterm 输入、窗口尺寸变化、返回主机列表并关闭 PTY。

浏览器测试的侧栏外壳由测试提供；它实际加载本插件发布的 `client.js` 和
`client.term.js`，真实 SSH 测试接入当前 DSH Connection/WebServer/Subprocess 服务。
已有 Electron 窗口可读取无障碍树，但截图接口持续超时，导致鼠标点击不可用；
因此没有声称完成整个 Electron 页面鼠标验收。

工作区选择器已经过真实 SSH 集成验证，原始截图保留在开发环境。
新增原生工作区流程通过浏览器测试外壳承载选择器/侧栏导航，工作区实体和会话持久化使用真实 DSH 服务。
当前 DSH 原生路径必须是本机目录，插件空目录承载会话身份，工程内容经 SSH 访问；未实现原生本机文件视图的远端替换。

### 0.1.3 入口消失回归

对话顶部 `conversation.session.header.utilities` 是列表插槽，要求 `id`。
0.1.2 误传 `key`，真实 SlotRegistry 抛出 `requires options.id`，Cordis 随后撤销整个 SSH 前端贡献。
新增回归使用已安装的 DSH 0.2.0-rc.2 SlotRegistry/Cordis 重现原错误及入口清理，
并确认修复后的入口、面板、对话标记全部注册成功，卸载后全部清理。
浏览器测试也已换用真实 SlotCore，8 项页面流程及 5 项 dev-vm 远端对话验证重新通过。
实际 Electron 页面无障碍树现已出现按钮“新建 SSH 会话 从 ~/.ssh/config 选择主机”。

测试主机已实测连通；另一个当时连接超时的主机没有计为通过。

## 用户使用

代码已写入当前已安装插件目录。DSH 中按 F5 加载最新客户端，
再按 Ctrl + Alt + B 打开右栏 → 新建 SSH 会话 → 选择 dev-vm。
测试和构建命令见 README；无需安装额外插件依赖。
