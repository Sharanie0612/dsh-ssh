# 开发说明

[返回 README](../README.md) · [使用手册](usage.md) · [测试指南](testing.md)

## 本地检查

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

## README 图片

浅色横幅和功能卡片使用 SVG，窄屏使用单列布局。修改配色、文字或图标后运行：

```bash
node tools/build-readme-art.mjs
```

脚本不需要额外依赖，输出位于 `docs/images/readme-light-*.svg`。README 的图片引用固定资源提交，以便 GitHub 预览和 npm 页面同时加载；更新图片后也应更新对应的资源提交地址。

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
