# DXM Screen App

Electron 容器应用，用于远程大屏展示，支持开机自启、全屏/Kiosk 模式、防休眠等功能。

## 功能特性

- 🚀 开机自启动
- 🖥️ 全屏/Kiosk 模式（防止用户退出）
- 🔒 单实例运行（避免多开）
- ⏰ 保持唤醒（防止息屏）
- 🔄 网络异常自动重试
- ✨ **启动前等待服务就绪（智能检测 Docker 容器）**
- ⌨️ 可配置退出热键（默认 `Ctrl+Shift+Q`）
- 🔧 **灵活的配置系统（支持环境区分 + 打包后外部修改）**
- 🐛 可选的开发者工具（F12 / Ctrl+Shift+I）

## 快速开始

### 开发

```bash
# 安装依赖
pnpm install

# 启动开发模式（自动使用 development 配置）
pnpm start
```

### 打包

```bash
# 打包 Windows 安装包（自动使用 production 配置）
pnpm run dist:win

# 打包所有平台
pnpm run dist:all

# 打包带调试工具的版本
pnpm run dist:win:devtools
```

## 配置说明

### 🎯 核心特性：打包后可修改配置

**打包后无需重新编译，直接修改 exe 同目录的配置文件即可！**

安装后的配置文件位置示例：

```
C:\Program Files\DXM Screen App\
├── DXM Screen App.exe
├── config.json              ← 在这里修改 URL 等配置
└── config.production.json   ← 可选的生产环境覆盖配置
```

只需用记事本/VS Code 打开 `config.json`，修改 `url` 等字段后**重启应用**即可生效。

### 配置文件加载顺序

应用会按以下顺序合并配置（后者覆盖前者）：

1. **内置默认值**（代码中的 defaults）
2. **`config.json`**（通用基础配置）
3. **`config.{env}.json`**（环境专属配置，如 `config.development.json`、`config.production.json`）
4. **`config.local.json`**（本地私有配置，不会被提交到 Git）

### 环境判定优先级

- 启动参数：`--env development` 或 `--env=production`
- 环境变量：`APP_ENV`
- 其次：`NODE_ENV`
- 默认：打包后为 `production`，开发中为 `development`

### 配置项说明

```json
{
  "url": "http://your-bigscreen-url.com",  // 大屏地址（必填）
  "autoLaunch": true,                       // 开机自启
  "kiosk": true,                            // Kiosk 模式（无边框、禁用快捷键）
  "fullscreen": true,                       // 全屏模式
  "alwaysOnTop": true,                      // 窗口置顶
  "keepAwake": true,                        // 防止息屏
  "reloadOnFailSeconds": 10,                // 加载失败后重试间隔（秒）
  "exitHotkey": "Ctrl+Shift+Q",            // 退出热键
  "displayIndex": 0,                        // 显示器索引（多屏时）
  "zoomFactor": 1.0,                        // 页面缩放比例
  "userAgentAppend": " BigScreenContainer/1.0",  // UA 追加标识
  "openDevTools": false,                    // 启动时打开开发者工具

  // 🆕 启动前服务检查配置（防止 Docker 容器未就绪）
  "waitForServiceReady": true,              // 是否启用启动前检查
  "waitForServiceMaxSeconds": 120,          // 最长等待时间（秒），超时后仍会启动
  "waitForServiceCheckInterval": 3          // 检查间隔（秒）
}
```

#### 启动前服务检查说明

当 `waitForServiceReady` 为 `true` 时（默认启用），应用会在创建窗口前先检测大屏服务（Docker 容器）是否可用：

- ✅ **自动等待**: 应用启动后会自动等待 Docker 容器就绪，避免显示离线页面
- ⏱️ **智能检测**: 每隔几秒检查一次服务是否可访问
- 🔄 **超时保护**: 超过最长等待时间后仍会启动应用（利用内置的重试机制）
- 📊 **详细日志**: 在控制台输出检查进度，便于排查问题

**典型场景**：电脑重启后，Electron 和 Docker 都设置了开机自启，但 Docker 容器启动需要时间。启用此功能后，Electron 会耐心等待 Docker 就绪后再显示大屏内容。

### 配置文件模板

项目根目录提供了 `config.example.json` 作为配置模板。

### 示例：区分开发/生产环境

**方式一：使用环境专属配置（推荐）**

编辑 `config.development.json`（开发时自动使用）：

```json
{
  "url": "http://localhost:3000",
  "openDevTools": true,
  "kiosk": false
}
```

编辑 `config.production.json`（打包后自动使用）：

```json
{
  "url": "http://8.140.255.182:100/",
  "openDevTools": false,
  "kiosk": true
}
```

然后运行：

- 开发：`pnpm start` 自动使用 development 配置
- 打包：`pnpm run dist:win` 自动使用 production 配置

**方式二：使用本地覆盖配置**

创建 `config.local.json`（不会被提交到 Git）：

```json
{
  "url": "http://localhost:8080"
}
```

此配置优先级最高，会覆盖所有其他配置。

## 调试

### 开发模式

开发时自动开启 DevTools，可使用 F12 或 Ctrl+Shift+I 切换。

### 打包后调试

**方式一：启动参数**

```powershell
# 启用 DevTools（可用 F12 切换）
& "C:\Program Files\DXM Screen App\DXM Screen App.exe" --devtools

# 启动即打开 DevTools
& "C:\Program Files\DXM Screen App\DXM Screen App.exe" --devtools --open-devtools
```

**方式二：环境变量**

```powershell
$env:OPEN_DEVTOOLS = "1"
& "C:\Program Files\DXM Screen App\DXM Screen App.exe"
```

**方式三：配置文件**

修改安装目录的 `config.json`：

```json
{
  "openDevTools": true
}
```

## 退出应用

- 开发/调试模式：Alt+F4 / Ctrl+W 或关闭窗口
- Kiosk 模式：按配置的退出热键（默认 `Ctrl+Shift+Q`）

## 故障排查

### 打包失败：符号链接权限错误

如遇到 `Cannot create symbolic link` 错误，请：

1. 开启 Windows 开发者模式（推荐）：
   - 设置 → 隐私和安全性 → 针对开发人员 → 开启"开发者模式"

2. 或使用管理员权限运行 PowerShell

3. 或使用项目已配置的环境变量（脚本中已默认启用）：

   ```powershell
   $env:SZA_NO_SYMLINKS = "true"
   pnpm run dist:win
   ```

### 网络下载超时

项目已配置国内镜像（`.npmrc`），Electron/NSIS 等二进制文件会从 npmmirror 下载。如仍有问题，请检查网络或代理设置。

### 配置不生效

1. 检查配置文件格式是否为有效 JSON（建议用 VS Code 编辑）
2. 查看应用启动时的控制台输出（有"已加载配置"日志），确认加载了哪些配置文件
3. 打包后确保配置文件在 exe 同目录（不在 `resources\app.asar` 内部）

## 项目结构

```
dxm-screen-app/
├── main.js                    # 主进程
├── preload.js                 # 预加载脚本
├── index.html                 # 主窗口（未使用）
├── offline.html               # 离线提示页
├── config.json                # 通用配置（已加入 .gitignore）
├── config.development.json    # 开发配置
├── config.production.json     # 生产配置
├── config.example.json        # 配置模板
├── .npmrc                     # npm/pnpm 镜像配置
├── package.json               # 项目配置
└── build/                     # 构建资源（图标等）
```

### 自定义图标

将图标文件放入 `build/` 目录：

- Windows: `icon.ico`
- macOS: `icon.icns`
- Linux: `icons/` (多尺寸 PNG)

## 许可证

MIT

## 作者

459605823
