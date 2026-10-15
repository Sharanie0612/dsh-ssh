# DSH SSH

在 DeepSeek Harness 中连接远端工程，浏览文件、使用终端，并让 Agent 通过 SSH 执行任务。

[npm](https://www.npmjs.com/package/@sharanie/dsh-ssh) · [使用手册](https://github.com/Sharanie0612/dsh-ssh/blob/main/docs/usage.md) · [问题反馈](https://github.com/Sharanie0612/dsh-ssh/issues)

## 能做什么

- **远端工作区** — 选择 SSH 主机与工程目录，添加到左侧工作区。
- **文件浏览** — 查看目录、预览文本，从文件或目录发起对话。
- **交互终端** — 在 DSH 内打开 SSH 终端，支持中文与窗口尺寸调整。
- **Agent 协作** — 执行命令、搜索和编辑代码、上传下载文件；每个对话独立绑定主机与目录。

工程文件保留在远端。插件沿用本机 OpenSSH 配置，远端无需安装 DSH。

## 快速开始

### 1. 安装插件

在 DSH 的 **插件 → 手动安装** 中输入：

```text
@sharanie/dsh-ssh
```

安装并启用后，重启 DSH。打开右侧栏，确认出现 **新建 SSH 会话** 入口。

需要离线安装或从源码安装？参阅[安装说明](https://github.com/Sharanie0612/dsh-ssh/blob/main/docs/usage.md#安装与认证)。

### 2. 准备 SSH 主机

在运行 DSH 的用户的 `~/.ssh/config` 中添加主机别名：

```sshconfig
Host dev-vm
    HostName vm.example.com
    User developer
    IdentityFile ~/.ssh/id_ed25519
```

替换示例地址、用户名和密钥路径。Windows 对应的配置文件为 `%USERPROFILE%/.ssh/config`。

首次连接时，先运行 `ssh dev-vm` 核对主机指纹。退出远端后，再确认非交互连接可用：

```bash
ssh -o BatchMode=yes dev-vm "pwd"
```

Agent 和目录选择器需要密钥或 `ssh-agent` 认证。密码输入仅适用于交互终端；完整认证与跳板机配置见[使用手册](https://github.com/Sharanie0612/dsh-ssh/blob/main/docs/usage.md#1-配置并验证-ssh)。

### 3. 选择工程，开始对话

1. 点击左侧 **工作区** 旁的添加按钮，选择 **SSH 虚拟机**。
2. 选择主机，浏览到工程目录，点击 **添加此目录**。
3. 从该工作区新建对话，直接描述任务：

> 查看这个工程的目录结构和 README，说明如何启动；先不要修改文件。

新对话会自动继承主机和工程目录，对话标题栏显示当前 SSH 目标。

## 日常使用

### 浏览文件与打开终端

打开右侧栏的 **新建 SSH 会话**，选择主机后：

- **测试**：检查连接。
- **执行**：运行命令，查看输出与退出码。
- **文件**：浏览目录、预览文本。
- **终端**：打开交互式 SSH 会话。

交互终端从远端登录目录开始，进入工程时执行 `cd ~/projects/demo`。

### 让 Agent 操作工程

用自然语言描述任务即可，例如“查找当前工程中处理请求超时的代码”。Agent 使用 `ssh_*` 工具访问远端，绑定工作区后无需反复指定主机。

手动指定目标时，工具调用示例如下：

```text
ssh_connect { host: "dev-vm", cwd: "~/projects/demo", probe: true }
ssh_exec    { command: "git status --short" }
ssh_read    { path: "README.md" }
```

相对路径以绑定的远端目录为基准。完整的 12 个工具及参数见[工具参考](https://github.com/Sharanie0612/dsh-ssh/blob/main/docs/usage.md#agent-工具)。

## 使用前了解

当前为实验版本，已验证 DSH 桌面版 **0.2.0-rc.2**。

- 远端文件通过 SSH 文件浏览器和 `ssh_*` 工具访问，DSH 原生文件面板仍显示本机文件。
- 工程不会同步到本机；插件创建的本机空目录用于承载工作区身份。
- 单次二进制传输上限 **32 MiB**，文本编辑上限 **2 MiB**。其他限制见[使用手册](https://github.com/Sharanie0612/dsh-ssh/blob/main/docs/usage.md#使用限制)。

## 继续阅读

- [使用手册](https://github.com/Sharanie0612/dsh-ssh/blob/main/docs/usage.md) — 离线安装、跳板机、工具参数、路径规则与常见问题。
- [开发说明](https://github.com/Sharanie0612/dsh-ssh/blob/main/docs/development.md) — 项目结构、构建与打包。
- [测试指南](https://github.com/Sharanie0612/dsh-ssh/blob/main/docs/testing.md) — 测试环境与复现步骤。
- [验证记录](https://github.com/Sharanie0612/dsh-ssh/blob/main/TEST-REPORT.md) — 已有测试结果与验证范围。

反馈问题请前往 [GitHub Issues](https://github.com/Sharanie0612/dsh-ssh/issues)，附上版本、系统、复现步骤和脱敏后的错误信息。

本项目暂未指定整体开源许可证；xterm 与 addon-fit 的 MIT 许可保留在 `vendor/`。
