#!/usr/bin/env pwsh
# Windows PowerShell 启动脚本 - 解决中文乱码问题

# 设置控制台输出编码为 UTF-8
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 设置环境变量
$env:APP_ENV = "development"

# 启动应用
& node_modules\.bin\electron .
