# 展厅大屏容器（Electron）

基于 Electron 的最小大屏容器，支持：

- 开机自启（Windows/macOS）
- 启动即全屏/自助机（kiosk）/置顶
- 加载远程大屏 URL
- 失联/加载失败离线页 + 自动重试
- 禁止缩放、阻止常见退出快捷键（提供可配置退出热键）
- 防休眠
- 多显示器选择
- 打包发布（electron-builder，Windows NSIS）

## 快速开始（开发）

```bash
npm install
npm start
```

配置目标地址：

- 编辑 `config.json` 的 `url`，或使用环境变量：

  ```powershell
  # Windows PowerShell
  $env:BIGSCREEN_URL="https://your-dashboard-url"; npm start
  ```

## 打包（Windows）

1) 准备图标

- 将 `build/icon.ico` 替换为你的 ICO 图标（建议 256x256，内含多尺寸）。
- 可选：放置 `build/icon.icns`（macOS），`build/icons/*`（Linux）。

2) 生成安装包

```bash
npm run dist       # 生成 Windows NSIS 安装包（dist 目录）
# 或
npm run pack       # 仅输出未打包目录（便于调试）
```

输出：

- `dist/BigScreen-Setup-<version>.exe`

安装后：

- 将创建开始菜单与桌面快捷方式（可在 `package.json > build > nsis` 调整）。
- 应用内已启用开机自启（`app.setLoginItemSettings`），建议在安装后首启时生效。

## 配置项（config.json）

- url: 远程大屏地址（必填）
- autoLaunch: 是否开机自启
- kiosk: Kiosk 模式（屏蔽多数系统快捷键）
- fullscreen: 全屏显示
- alwaysOnTop: 窗口置顶
- keepAwake: 防止系统息屏
- reloadOnFailSeconds: 加载失败后自动重试间隔（秒）
- exitHotkey: 退出热键，默认 `Ctrl+Shift+Q`
- displayIndex: 展示的显示器序号（从 0 开始）
- zoomFactor: 页面缩放因子（默认 1.0）
- userAgentAppend: 追加到 User-Agent 的标识字符串
- openDevTools: 开发时自动打开 DevTools

## 代码签名（可选但推荐）

- Windows：使用企业或 EV 代码签名证书签名安装包，以减少 SmartScreen 警告。
- macOS：需要开发者证书与公证（本模板已包含 macOS 构建配置，可选启用）。

## 常见问题

- 安装包启动后没有自启？
  - 开机自启依赖已安装的可执行路径。请以安装包形式部署，不要依赖开发态 `electron.exe`。
- 桌面或开始菜单名称修改？
  - 编辑 `package.json > build > nsis.shortcutName` 与 `productName`。
- 仅打 Windows 包？
  - 使用 `npm run dist:win` 或 `electron-builder -w`。
