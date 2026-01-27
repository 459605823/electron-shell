# Electron Shell 大屏容器应用

Electron 容器应用，用于远程大屏展示。模块化架构，支持多项目复用，具备开机自启、全屏/Kiosk 模式、防休眠、服务检查等完整功能。

## ✨ 功能特性

- 🚀 **开机自启动** - Windows/macOS 系统级自启动
- 🖥️ **Kiosk 模式** - 全屏锁定，防止用户退出
- 🔒 **单实例运行** - 避免多开，多次启动时聚焦已存在窗口
- ⏰ **保持唤醒** - 防止系统息屏
- 🔄 **智能重试** - 网络异常自动重载
- ✅ **服务检查** - 启动前等待服务就绪（可选）
- ⌨️ **灵活热键** - 可配置退出快捷键和调试快捷键
- 🎨 **多屏支持** - 指定显示器索引
- 🔧 **配置驱动** - 支持环境区分 + 打包后外部修改
- 📊 **日志系统** - 日志级别控制 + 文件输出
- 🧩 **模块化架构** - 清晰的代码组织，易于复用和扩展

## 🚀 快速开始

### 开发模式

```bash
# 安装依赖
pnpm install

# 启动开发模式（自动使用 development 配置）
# 方式 1：跨平台启动（可能有中文乱码）
pnpm start

# 方式 2：Windows 启动（推荐，中文正常显示）
pnpm run start:win
```

> **提示**：Windows 系统推荐使用 `pnpm run start:win` 启动，可以正确显示中文日志。

### 打包分发

```bash
# 打包 Windows 安装包（自动使用 production 配置）
pnpm run dist:win

# 打包所有平台
pnpm run dist:all

# 打包带调试工具的版本
pnpm run dist:win:devtools
```

## 📐 架构说明

### 模块化结构

项目采用模块化架构，便于代码复用和多项目封装：

```
electron-shell/
├── main.js                    # 主入口（精简，仅负责模块组装）
├── preload.js                 # 预加载脚本（IPC 桥接）
├── offline.html               # 离线提示页（带手动重试按钮）
├── config.json                # 通用配置
├── config.development.json    # 开发配置
├── config.production.json     # 生产配置
├── src/                       # 源代码模块
│   ├── config/               # 配置管理
│   │   ├── loader.js         # 配置加载器（多层合并）
│   │   └── validator.js      # 配置验证器
│   ├── window/               # 窗口管理
│   │   └── manager.js        # 窗口管理器（创建、加载、错误处理）
│   ├── system/               # 系统集成
│   │   └── integration.js    # 系统功能（自启、热键、防休眠）
│   ├── network/              # 网络功能
│   │   └── checker.js        # 服务可用性检查
│   └── utils/                # 工具模块
│       └── logger.js         # 日志工具（级别控制、文件输出）
├── package.json              # 项目配置
└── build/                    # 构建资源（图标等）
```

### 核心模块说明

#### 配置管理 (`src/config/`)

- **loader.js**: 多层配置合并，支持外部优先读取
- **validator.js**: 配置验证，启动时检查配置合法性

#### 窗口管理 (`src/window/`)

- **manager.js**: 窗口生命周期管理、导航控制、错误处理

#### 系统集成 (`src/system/`)

- **integration.js**: 开机自启、全局快捷键、防休眠等系统功能

#### 网络功能 (`src/network/`)

- **checker.js**: HTTP/HTTPS 服务可用性检查，支持重试和超时控制

#### 工具模块 (`src/utils/`)

- **logger.js**: 统一的日志系统，支持日志级别和文件输出

### 数据流

```
启动应用
  ↓
加载配置 (loader.js)
  ↓
验证配置 (validator.js)
  ↓
初始化系统集成 (integration.js)
  ├─ 开机自启
  ├─ 注册热键
  └─ 防休眠
  ↓
[可选] 等待服务就绪 (checker.js)
  ↓
创建窗口 (manager.js)
  ↓
加载大屏 URL
  ├─ 成功 → 显示内容
  └─ 失败 → 离线页面 + 自动重试
```

## 🔧 配置说明

### 🎯 核心特性：打包后可修改配置

**打包后无需重新编译，直接修改 exe 同目录的配置文件即可！**

安装后的配置文件位置示例：

```
C:\Program Files\Electron Shell\
├── Electron Shell.exe
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
  "userAgentAppend": " ElectronShell/1.0",  // UA 追加标识
  "openDevTools": false,                    // 启动时打开开发者工具

  // 启动前服务检查配置（防止 Docker 容器未就绪）
  "waitForServiceReady": false,             // 是否启用启动前检查（默认禁用，按需启用）
  "waitForServiceMaxSeconds": 120,          // 最长等待时间（秒），超时后仍会启动
  "waitForServiceCheckInterval": 3          // 检查间隔（秒）
}
```

### 配置项详解

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `url` | string | 必填 | 大屏服务地址 |
| `autoLaunch` | boolean | true | 开机自启动 |
| `kiosk` | boolean | true | Kiosk 模式（无边框、禁用快捷键） |
| `fullscreen` | boolean | true | 全屏模式 |
| `alwaysOnTop` | boolean | true | 窗口置顶 |
| `keepAwake` | boolean | true | 防止息屏 |
| `reloadOnFailSeconds` | number | 10 | 加载失败后重试间隔（秒），0 表示不重试 |
| `exitHotkey` | string | "Ctrl+Shift+Q" | 退出快捷键 |
| `displayIndex` | number | 0 | 显示器索引（多屏时） |
| `zoomFactor` | number | 1.0 | 页面缩放比例 |
| `userAgentAppend` | string | " ElectronShell/1.0" | UA 追加标识 |
| `openDevTools` | boolean | false | 启动时打开开发者工具 |
| `waitForServiceReady` | boolean | false | 启用启动前服务检查 |
| `waitForServiceMaxSeconds` | number | 120 | 服务检查最长等待时间（秒） |
| `waitForServiceCheckInterval` | number | 3 | 服务检查间隔（秒） |

### 启动前服务检查说明

当 `waitForServiceReady` 设置为 `true` 时，应用会在创建窗口前先检测大屏服务是否可用：

- ✅ **自动等待**: 应用启动后会自动等待服务就绪，避免显示离线页面
- ⏱️ **智能检测**: 每隔指定秒数检查一次服务是否可访问
- 🔄 **超时保护**: 超过最长等待时间后仍会启动应用（利用内置的重试机制）
- 📊 **详细日志**: 在日志文件中输出检查进度，便于排查问题

**典型使用场景**：

电脑重启后，Electron 和 Docker 都设置了开机自启，但 Docker 容器启动需要时间。启用此功能后，Electron 会耐心等待 Docker 就绪后再显示大屏内容，避免用户看到长时间的离线页面。

**建议配置**：

- 普通场景：设置为 `false`，利用内置的自动重试机制
- Docker/服务启动慢：设置为 `true`，配置合理的等待时间

## 📝 日志系统

应用内置日志系统，支持日志级别控制和文件输出。

### 日志级别

- `DEBUG`: 调试信息（仅开发模式）
- `INFO`: 一般信息
- `WARN`: 警告信息
- `ERROR`: 错误信息

### 日志文件位置

- Windows: `%APPDATA%\electron-shell\logs\app-YYYY-MM-DD.log`
- macOS: `~/Library/Application Support/electron-shell/logs/app-YYYY-MM-DD.log`
- Linux: `~/.config/electron-shell/logs/app-YYYY-MM-DD.log`

日志按天分割，便于查看和管理。

## 🐛 调试

### 开发模式

开发时自动开启 DevTools，可使用 F12 或 Ctrl+Shift+I 切换。

### 打包后调试

**方式一：启动参数**

```powershell
# 启用 DevTools（可用 F12 切换）
& "C:\Program Files\Electron Shell\Electron Shell.exe" --devtools

# 启动即打开 DevTools
& "C:\Program Files\Electron Shell\Electron Shell.exe" --devtools --open-devtools
```

**方式二：环境变量**

```powershell
$env:OPEN_DEVTOOLS = "1"
& "C:\Program Files\Electron Shell\Electron Shell.exe"
```

**方式三：配置文件**

修改安装目录的 `config.json`：

```json
{
  "openDevTools": true
}
```

## 🔑 退出应用

- 开发/调试模式：Alt+F4 / Ctrl+W 或关闭窗口
- Kiosk 模式：按配置的退出热键（默认 `Ctrl+Shift+Q`）
