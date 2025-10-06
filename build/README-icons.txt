放置应用图标：
- Windows 安装包图标：build/icon.ico（256x256，多分辨率 ICO）
- macOS 应用图标：build/icon.icns
- Linux 图标目录：build/icons/（包含 512x512 等 PNG）

请将自有图标文件替换到上述路径；若缺失，electron-builder 会使用默认占位或构建失败（视平台而定）。