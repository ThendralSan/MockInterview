@echo off
title Stop Parakeet AI Copilot
cd /d "%~dp0"

echo =====================================================================
echo   Stopping Parakeet AI Copilot Server (Port 8080)...
echo =====================================================================
echo.

set found=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    set found=1
    echo Terminating process PID %%a on port 8080...
    taskkill /F /PID %%a >nul 2>nul
)

if "%found%"=="1" (
    echo [OK] Parakeet AI Copilot stopped successfully.
) else (
    echo [INFO] No running process found on port 8080.
)

echo.
ping 127.0.0.1 -n 2 >nul
exit /b 0
