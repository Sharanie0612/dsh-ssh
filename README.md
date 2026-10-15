<p align="center">
  <img src="https://raw.githubusercontent.com/Sharanie0612/dsh-ssh/main/docs/images/banner.svg" alt="DSH SSH — Remote workspaces for DeepSeek Harness" width="100%">
</p>

<p align="center"><strong>把远端工程接入 DeepSeek Harness，让 Agent、文件浏览器与 SSH 终端协同工作。</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@sharanie/dsh-ssh"><img src="https://img.shields.io/npm/v/%40sharanie%2Fdsh-ssh?color=2563eb" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@sharanie/dsh-ssh"><img src="https://img.shields.io/npm/dm/%40sharanie%2Fdsh-ssh" alt="npm monthly downloads"></a>
  <img src="https://img.shields.io/badge/status-experimental-f59e0b" alt="Experimental">
  <img src="https://img.shields.io/badge/DSH-tested%20on%200.2.0--rc.2-14b8a6" alt="Tested with DSH 0.2.0-rc.2">
  <img src="https://img.shields.io/badge/transport-OpenSSH-64748b" alt="OpenSSH">
</p>

<p align="center"><a href="https://www.npmjs.com/package/@sharanie/dsh-ssh">npm</a> · <a href="#功能">功能</a> · <a href="#安装">安装</a> · <a href="#使用">使用</a> · <a href="#agent-工具">Agent 工具</a> · <a href="#常见问题">常见问题</a> · <a href="#开发与测试">开发与测试</a></p>

---

DSH SSH 是 DeepSeek Harness（DSH）的远程开发插件。沿用本机 OpenSSH 配置，把 Linux 服务器、虚拟机或开发板上的工程添加到左侧工作区，在对话中操作远端代码，并随时打开文件浏览器和交互终端。

**选主机 → 选工程目录 → 新建对话 → 直接描述任务。** 新对话自动继承 SSH 目标，消息框保持空白，无需反复填写主机和路径。

适合在虚拟机中开发、在服务器上排查日志，或在开发板上执行构建与调试。工程文件保留在远端，无需先完整下载到本机。

> **已发布 npm：[`@sharanie/dsh-ssh`](https://www.npmjs.com/package/@sharanie/dsh-ssh)**，当前发布版本为 **0.2.1**。本插件使用专门的 `ssh_*` 工具操作远端；DSH 原生本机文件工具仍访问本机。

## 功能

| 功能 | 你可以做什么 |
| :--- | :--- |
| **虚拟机工作区** | 从左侧“添加工作区”选择 SSH 主机与远端目录，为工程创建独立分组。 |
| **图形目录选择器** | 点击目录、返回上级，或输入路径后打开；重复添加同一目录会复用工作区。 |
| **远端文件浏览** | 查看目录、文件类型与大小，预览文本，从目录或指定文件新建对话。 |
| **交互式终端** | 使用真实 `ssh -tt` 会话，支持中文、ANSI 输出与尺寸调整。 |
| **12 个 SSH Agent 工具** | 选择主机、执行命令，搜索、读写和编辑文件，上传、下载二进制文件并校验 SHA-256。 |
| **隔离与恢复** | 每个对话独立绑定主机与路径，界面选择可在重载后恢复。 |
| **沿用 OpenSSH 配置** | 从 `~/.ssh/config` 读取主机别名，复用密钥、`ssh-agent` 与跳板机配置。 |

### 界面预览

<p align="center">
  <img src="https://raw.githubusercontent.com/Sharanie0612/dsh-ssh/main/docs/images/guide-light.png" alt="亮色主题入口" width="48%">
  <img src="https://raw.githubusercontent.com/Sharanie0612/dsh-ssh/main/docs/images/guide-dark.png" alt="暗色主题入口" width="48%">
</p>

<p align="center"><sub>亮色与暗色入口预览，使用 DSH 原生卡片样式。截图来自浏览器测试外壳。</sub></p>

<details>
<summary><strong>查看终端演示</strong></summary>

![SSH 终端演示](https://raw.githubusercontent.com/Sharanie0612/dsh-ssh/main/docs/images/ssh-panel.png)

这是加载真实插件与 xterm 的模拟接口演示，不代表真实远端主机连接验收。

</details>

## 安装

### 环境要求

| 位置 | 要求 |
| :--- | :--- |
| DSH | 已验证桌面版 **0.2.0-rc.2**；其他版本需确认服务与插槽接口兼容性。 |
| 运行 DSH 的本机 | OpenSSH 客户端，`ssh` 可通过 `PATH` 找到；非交互操作需密钥或 `ssh-agent` 认证。 |
| 远端主机 | 可访问的 SSH 服务、POSIX shell 与常用命令行工具。`ssh_glob` 需要 Bash；二进制读写需要 `base64`，传输校验需要 `sha256sum` 或 `shasum`。 |

插件不要求在远端安装 DSH。发布包已包含终端模块与页面资源，使用时无需额外安装 xterm 或 React。Node.js 24 是本仓库的开发测试环境。

### 1. 配置并验证 SSH

主机配置位于**运行 DSH 的系统用户**的 SSH 目录中：

- Windows：`%USERPROFILE%/.ssh/config`
- macOS / Linux：`~/.ssh/config`

添加一个主机别名，将地址、用户和密钥路径替换为实际值：

```sshconfig
Host dev-vm
    HostName vm.example.com
    User developer
    Port 22
    IdentityFile ~/.ssh/id_ed25519
```

先在普通终端连接，再验证插件使用的非交互认证：

```bash
ssh dev-vm
ssh -o BatchMode=yes dev-vm "pwd"
```

第一条命令可用于检查首次连接的主机指纹，退出远端后执行第二条。第二条能够直接返回目录时，Agent 工具和图形目录选择器才具备可用的认证条件。加密私钥可预先通过 `ssh-add` 加入 `ssh-agent`。

> 交互终端可以输入密码；Agent 工具、连接测试与目录选择器使用 `BatchMode=yes`，不会提示输入密码。在终端中登录成功，不会把密码认证共享给 Agent。

<details>
<summary><strong>通过跳板机连接</strong></summary>

```sshconfig
Host bastion
    HostName bastion.example.com
    User developer
    IdentityFile ~/.ssh/id_ed25519

Host dev-vm
    HostName 10.0.0.10
    User developer
    IdentityFile ~/.ssh/id_ed25519
    ProxyJump bastion
```

插件把主机别名交给系统 OpenSSH，实际连接遵循你的 SSH 配置。请先确认 `ssh -o BatchMode=yes dev-vm "pwd"` 可用。

</details>

### 2. 从 npm 安装（推荐）

打开 DSH **插件 → 手动安装**，输入完整包名：

```text
@sharanie/dsh-ssh
```

需要固定版本时填写：

```text
@sharanie/dsh-ssh@0.2.1
```

安装并启用后，重启 DSH 以加载插件；如果仅页面未更新，可先刷新。打开右侧栏，确认出现 **新建 SSH 会话** 入口。

包信息与版本历史见 [npm 页面](https://www.npmjs.com/package/@sharanie/dsh-ssh)。请保留 `@sharanie/` 作用域，仓库源码中的内部包名 `@local/dsh-ssh` 不是公开 npm 安装名。

若目标机器无法访问 npm，可在联网机器下载发布包，再通过 DSH 的本地文件路径安装：

```bash
npm pack @sharanie/dsh-ssh@0.2.1 --registry=https://registry.npmjs.org
```

把命令输出的 `.tgz` 文件传到目标机器，按下一节操作。

### 3. 本地安装包（离线安装）

使用上一步下载的 npm 发布包，或下载仓库提供的 [dsh-ssh-0.2.1.tgz](https://github.com/Sharanie0612/dsh-ssh/raw/refs/heads/main/releases/dsh-ssh-0.2.1.tgz)。两种来源的文件名可能不同，请填写实际文件路径。

1. 把 `.tgz` 文件保存到本机，**不要解压**。
2. 打开 DSH **插件 → 手动安装**。
3. 输入该文件的完整绝对路径，例如 `C:/Downloads/dsh-ssh-0.2.1.tgz`。
4. 安装并启用后，刷新页面或重启 DSH。

这是预构建、无运行时依赖的安装包，安装本地文件不需要 DSH 再连接 GitHub，也不需要 Git。

使用仓库提供的离线包时，可对照其 [SHA-256 校验文件](https://github.com/Sharanie0612/dsh-ssh/blob/main/releases/dsh-ssh-0.2.1.tgz.sha256) 检查下载内容；此校验值仅适用于该仓库文件，不适用于 npm 重新打包的文件：

```powershell
Get-FileHash C:/Downloads/dsh-ssh-0.2.1.tgz -Algorithm SHA256
```

### 4. 从 GitHub 或源码目录安装

DSH 手动安装框也可填写仓库地址：

```text
https://github.com/Sharanie0612/dsh-ssh
```

如果 GitHub 连接预检查超时，改用 npm 或本地 `.tgz`。npm registry 和 GitHub 是不同的下载来源，修改 npm 源不能修复 GitHub 连接超时。

开发时可以克隆仓库：

```bash
git clone https://github.com/Sharanie0612/dsh-ssh.git
cd dsh-ssh
```

打开插件管理界面，将克隆目录的**绝对路径**作为 bundle 安装。也可使用 DSH 的 `plugin_manager` 工具：

```text
plugin_manager {
  action: "install_bundle",
  target: "C:/Projects/dsh-ssh"
}
```

把示例路径换成实际目录。安装后刷新页面或重启 DSH。

## 使用

### 添加虚拟机工作区

1. 点击左侧 **工作区** 旁的添加按钮。
2. 选择 **SSH 虚拟机**，再选择主机。
3. 点击目录进入工程，或输入路径后点 **打开**。
4. 可选填名称，点击 **添加此目录**。
5. 从新工作区新建对话，直接填写任务。

默认名称为 `工程目录 · 主机名 (SSH)`。对话标题栏显示当前 SSH 目标；选择器也保留 **本机** 文件夹选项。

在新对话中可以直接提出任务，例如：

```text
查看这个远端工程的目录结构和 README，说明如何启动；先不要修改文件。
```

```text
在当前 SSH 工程中查找 API 请求超时的相关代码，分析原因并给出修改建议。
```

Agent 通过 `ssh_*` 工具在所选远端目录中执行任务。切换到另一个对话时，该对话使用自己的主机和目录绑定。

### 浏览文件与打开终端

打开右侧栏，在“开始”页选择 **新建 SSH 会话**：

- **测试**：检查主机连通性。
- **执行**：运行命令，查看输出与退出码。
- **文件**：浏览远端工程、预览文本，针对目录或文件新建对话。
- **终端**：打开交互 SSH；返回主机页时关闭该终端。

已绑定工作区的对话会恢复主机，文件浏览从对应远端目录开始。

### 路径与会话规则

- 绑定工作区或调用 `ssh_connect` 后，SSH 工具可以省略 `host`；相对路径以绑定的远端工程目录为基准。
- 未指定工程目录时，默认从远端用户的主目录开始。远端路径使用 `/`，例如 `~/projects/demo`。
- `local_path` 始终是**运行 DSH 的机器**上的文件路径，例如 `C:/Downloads/result.zip`。
- `ssh_connect` 设置当前对话的默认目标。每次 `ssh_exec` 独立执行命令；需要跨调用保留的目录应写入 `cwd`，需要连续交互的 shell 使用终端。
- 交互终端启动在远端登录 shell 的默认目录。进入工程时，在终端中执行 `cd ~/projects/demo`。

## Agent 工具

通常只需用自然语言描述任务，Agent 会选择工具。下面的调用格式用于说明参数，**不是普通终端命令**。

| 工具 | 用途 | 常用参数 |
| :--- | :--- | :--- |
| `ssh_hosts` | 查看主机配置、当前目标，可选探测连通性。 | `probe` |
| `ssh_connect` | 设置当前对话的默认主机和工程目录。 | `host`、`cwd`、`probe` |
| `ssh_disconnect` | 解除当前对话的默认目标。 | 无 |
| `ssh_exec` | 执行命令，返回标准输出、错误输出与退出码。 | `command`、`cwd`、`timeout_ms` |
| `ssh_ls` | 列出目录。 | `path` |
| `ssh_read` | 按行读取文本。 | `path`、`offset`、`limit` |
| `ssh_write` | 写入 UTF-8 文本，替换文件全部内容。 | `path`、`content` |
| `ssh_edit` | 精确替换文本，默认要求只匹配一处。 | `path`、`old_string`、`new_string`、`replace_all` |
| `ssh_glob` | 按 glob 模式查找文件。 | `pattern`、`cwd`、`limit` |
| `ssh_grep` | 按正则表达式搜索内容。 | `pattern`、`cwd`、`include`、`limit` |
| `ssh_upload` | 从本机上传文件，并校验 SHA-256。 | `local_path`、`path` |
| `ssh_download` | 下载远端文件到本机，并校验 SHA-256。 | `path`、`local_path` |

除主机列表、连接与断开工具外，以上工具也支持显式传入 `host`。先选择主机并查看工程：

```text
ssh_hosts   {}
ssh_connect { host: "dev-vm", cwd: "~/projects/demo", probe: true }
ssh_exec    { command: "git status --short" }
ssh_read    { path: "README.md" }
```

搜索源码并执行测试：

```text
ssh_glob { pattern: "**/*.js", limit: 100 }
ssh_grep { pattern: "timeout", include: "*.js", limit: 50 }
ssh_exec { command: "npm test", timeout_ms: 180000 }
```

传输单个文件，目标父目录须已存在：

```text
ssh_upload   { local_path: "C:/Downloads/config.json", path: "config/config.json" }
ssh_download { path: "dist/result.zip", local_path: "C:/Downloads/result.zip" }
```

`ssh_write` 会覆盖已有内容；局部修改优先使用 `ssh_edit`。`ssh_disconnect` 解除对话绑定，交互终端的关闭由终端界面单独管理。

## 当前边界

- **工作区分组已接入原生 DSH，远端文件仍使用 SSH 文件浏览器。** 原生“工作区文件”和普通本机工具不会自动转为远端访问。
- 当前 DSH 要求工作区对应本机目录。插件在 `.ssh-workspaces/` 下创建空目录承载会话身份，工程内容保留在远端，不进行本地同步。
- 文件浏览界面支持读取与预览；写入、传输和重命名使用 Agent 工具。
- 二进制传输上限 **32 MiB / 次**，文本编辑上限 **2 MiB**；不支持断点续传或目录同步。
- 终端最多保留 **8 个会话**，每个会话保留 **512 KiB** 输出；主机进程重启后需要重新连接。
- 主机列表支持 `Include` 与默认配置，不列出通配别名，也不解析条件 `Match`。实际连接遵循 OpenSSH 配置。
- `ssh_glob` 依赖远端 Bash；`ssh_grep` 优先使用 ripgrep，缺失时回退到 grep。

## 常见问题

### 安装时提示找不到包，或仍在连接 GitHub

确认使用完整 npm 包名 **`@sharanie/dsh-ssh`**。`dsh-ssh` 与其他作用域下的同名包可能是不同项目。仓库地址走 GitHub 下载流程；npm 包名走 registry 下载流程。离线环境使用 `.tgz` 的本机绝对路径。

### 主机列表为空，或没有显示某台主机

确认主机写在运行 DSH 的用户的 `~/.ssh/config` 中，使用明确的 `Host dev-vm` 别名。插件支持 `Include` 与默认配置，不列出 `Host *` 等通配别名，也不解析条件 `Match`。修改配置后重新打开或刷新主机列表。

### 普通 SSH 能登录，但连接测试、目录选择或 Agent 操作失败

先运行 `ssh -o BatchMode=yes dev-vm "pwd"`。如果失败，检查 `IdentityFile`、远端 `authorized_keys`、`ssh-agent` 和跳板机认证。需要输入密码或私钥口令的交互连接，并不代表非交互认证已经可用。

### 连接超时、主机密钥报错或找不到 ssh

- **超时**：先检查普通 SSH 是否可达，以及端口、VPN、防火墙和 `ProxyJump` 配置。
- **主机密钥变化**：确认服务器身份和变更原因后，再按 OpenSSH 的提示更新 `known_hosts`。
- **找不到 `ssh`**：安装 OpenSSH 客户端并确认 `ssh -V` 可运行；调整 `PATH` 后重新启动 DSH。

### 插件已安装，但入口或终端没有出现

确认插件已启用，刷新页面或重启 DSH，并打开右侧栏。已验证版本为 DSH **0.2.0-rc.2**。终端依赖 DSH 的 `subprocess` / PTY 服务；只有终端不可用时，也应检查该服务与主机进程日志。

### 为什么原生文件面板没有显示远端工程？

插件在左侧注册工作区分组，通过 SSH 文件浏览器展示远端文件；原生本机文件面板仍读取本机。查看远端文件请进入 SSH 的 **文件** 页面，或让 Agent 使用 `ssh_ls`、`ssh_read` 等工具。

### 修改 README 后，npm 页面为什么还是旧的？

npm 展示发布包中的 README。GitHub 上修改文档后，需要将更新后的 README 纳入新的 npm 版本并发布，npm 页面才会同步；已发布的同一版本不能直接覆盖。

## 开发与测试

使用 Node.js 24；Windows 后端用例还需要 Git Bash。

```bash
npm test
npm run build
```

下表摘自仓库的既有验证记录（2026-10-13 至 2026-10-14），用于说明已覆盖范围；不代表每次文档更新都重新执行了真实 SSH 验收。

| 开发环境验证 | 已记录结果 |
| :--- | :--- |
| 单元与回归测试 | **51 通过**，1 项因 Windows 软链接权限跳过。 |
| 浏览器界面回归 | **8 项通过**，浏览器错误为 0。 |
| 真实 SSH 后端 | **5 项通过**。 |
| 原生 PTY | **9 项通过**。 |
| 目录与文件对话 | **5 项通过**。 |
| 虚拟机工作区 | **6 项通过**，包含重复添加、自动绑定与重载隔离。 |

浏览器测试使用侧栏与导航外壳，后端使用真实 DSH 服务与 SSH；**尚未完成完整 Electron 鼠标验收**。

复现方法见 [测试指南](https://github.com/Sharanie0612/dsh-ssh/blob/main/docs/testing.md)，范围与记录见 [TEST-REPORT.md](https://github.com/Sharanie0612/dsh-ssh/blob/main/TEST-REPORT.md)。

<details>
<summary><strong>更多测试命令</strong></summary>

浏览器测试需先准备依赖与 DSH 运行时；真实 SSH 测试需使用可非交互访问的主机别名。完整准备步骤见测试指南。

```bash
npm run test:ui
npm run test:backend-live -- dev-vm
npm run test:terminal-live -- dev-vm
npm run test:workspace-live -- dev-vm
npm run test:projects-live -- dev-vm
```

</details>

## 项目结构

```text
lib/        工具、API、工作区绑定、前端与终端模块
src/        终端视图源片段
vendor/     xterm 与 addon-fit，保留第三方许可证
tests/      单元、浏览器与真实 SSH 集成测试
tools/      构建、运行时提取与预览脚本
docs/       使用素材与测试指南
```

修改终端视图或 vendored 资源后，运行 `npm run build`。修改主机代码后重新加载插件或重启 DSH，修改前端后刷新页面。开发用 HMR 监听路径应在本机 profile 配置，bundle 不包含固定机器路径。

生成离线安装包：`npm run pack:offline`。输出在 `releases/`，包含 `.tgz`、SHA-256 与 `latest.json`；包中已包含终端模块、bundle 补丁和所需页面资源。

### 反馈与贡献

欢迎通过 [GitHub Issues](https://github.com/Sharanie0612/dsh-ssh/issues) 反馈问题或提交功能建议。报告问题时，请提供 DSH 版本、本机与远端系统、插件版本、安装来源、复现步骤和相关错误输出。请去除日志中的密钥、令牌及其他敏感信息。

提交修改前请运行与变更相关的检查。终端视图或 vendored 资源变更还需重新构建；前端与远端操作的验证方法见测试指南。

## 认证与许可

插件使用系统 OpenSSH，沿用 `IdentityFile`、`ssh-agent`、`ProxyJump` 和 `known_hosts`。它不保存密码或私钥，也不改写 SSH 配置；界面 API 使用 DSH 原有认证通道。

连接使用 `StrictHostKeyChecking=accept-new`：首次连接可把新主机密钥加入 `known_hosts`，已知主机密钥发生变化时会拒绝连接。远端命令和文件访问使用 SSH 登录用户的权限。

本项目暂未指定整体开源许可证。`vendor/` 中的 xterm 与 addon-fit 使用 MIT 许可证，原始许可文件已保留。
