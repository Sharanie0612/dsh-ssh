# 测试指南

## 快速检查

使用 Node.js 24。Windows 后端用例通过 Git Bash 的真实 POSIX shell 执行，需安装 Git for Windows。

```bash
npm test
npm run build
```

未准备 DSH 运行时时，真实插槽注册器用例会跳过。准备后重新运行测试，覆盖插件激活与卸载。

## 浏览器与 DSH 运行时

浏览器测试需要 React 18、React DOM 18、Playwright、Chrome，以及桌面版 DSH 的运行时：

```bash
npm install --no-save react@18.3.1 react-dom@18.3.1 playwright@1.62.1
npm run prepare:test-runtime -- "C:/Apps/DSH/resources/app.asar"
npm run test:ui
```

把归档路径改为实际安装位置。测试支持 `DSH_TEST_ANCHOR`、`DSH_TEST_RUNTIME` 和 `DSH_TEST_BROWSER`，分别指定依赖解析锚点、提取后的 `node_modules` 与 Chrome 可执行文件。

提取文件和截图写入 `artifacts/`，不会进入 Git 提交。测试使用独立存储，不修改实际 DSH profile。

## 离线安装验证

```bash
npm run pack:offline
npm run test:install
```

安装用例使用真实 DSH PluginManager，在独立的全新 profile、空 pnpm store 和 pnpm 离线模式下安装本地 `.tgz`，
检查 bundle 声明、版本、补丁导出和主机工具激活。它不需要访问 GitHub，不修改实际用户 profile。
如 pnpm 安装位置不同，通过 `DSH_TEST_PNPM` 指定 `pnpm.cjs` 路径。

## 真实 SSH 集成

先确认普通终端可以非交互访问 SSH 别名，然后把 `dev-vm` 换为该别名：

```bash
npm run test:live -- dev-vm
npm run test:backend-live -- dev-vm
npm run test:terminal-live -- dev-vm
npm run test:workspace-live -- dev-vm
npm run test:projects-live -- dev-vm
```

| 脚本 | 覆盖范围 |
| --- | --- |
| `test:live` | 界面按钮、SSH 命令、文件浏览、原生 PTY 与认证拒绝。 |
| `test:backend-live` | 默认目录、中文读写、二进制 SHA-256、空文件与软链接。 |
| `test:terminal-live` | 中文、尺寸、多读者、尾部输出、退出码与终端释放。 |
| `test:workspace-live` | 目录/文件选择、空白消息框、提示词、持久化与解绑。 |
| `test:projects-live` | 图形目录导航、原生工作区、重复添加、自动绑定与隔离。 |

后端写入测试仅使用远端独立 `/tmp/dsh-ssh-test.*` 目录，结束后清理。工作区测试使用本机独立临时存储。

浏览器测试以测试侧栏与导航承载真实插件，后端使用实际 DSH 服务和 SSH。没有调用付费模型；这些测试不能替代完整 Electron 页面验收。
