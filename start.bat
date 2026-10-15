@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 理发店记账系统

echo ==================================
echo   理发店会员记账系统 启动中...
echo ==================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 没有检测到 Node.js，请先安装 Node.js LTS 并重启电脑
    pause
    exit /b
)

if not exist "node_modules\express" (
    echo 缺少依赖，正在安装（几秒钟）...
    call npm install --registry=https://registry.npmmirror.com
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请把上面的报错发出来
        pause
        exit /b
    )
)

echo.
echo 正在启动服务... 启动后不要关闭本窗口
echo.
node server.js

echo.
echo [服务已停止] 上面是最后的输出信息
pause
