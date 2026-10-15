# 使用手册

[返回 README](../README.md) · [开发说明](development.md) · [测试指南](testing.md)

需要跳板机、离线安装、工具参数或连接排查时，可以从这里继续查阅。

[安装与认证](#安装与认证) · [工作区与终端](#工作区与终端) · [Agent 工具](#agent-工具) · [使用限制](#使用限制) · [常见问题](#常见问题)

## 安装与认证

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

## 工作区与终端

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

## 使用限制

- 工作区分组已接入原生 DSH，远端文件通过 SSH 文件浏览器访问。 原生“工作区文件”和普通本机工具不会自动转为远端访问。
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

## 认证与许可

插件使用系统 OpenSSH，沿用 `IdentityFile`、`ssh-agent`、`ProxyJump` 和 `known_hosts`。它不保存密码或私钥，也不改写 SSH 配置；界面 API 使用 DSH 原有认证通道。

连接使用 `StrictHostKeyChecking=accept-new`：首次连接可把新主机密钥加入 `known_hosts`，已知主机密钥发生变化时会拒绝连接。远端命令和文件访问使用 SSH 登录用户的权限。

本项目暂未指定整体开源许可证。`vendor/` 中的 xterm 与 addon-fit 使用 MIT 许可证，原始许可文件已保留。
