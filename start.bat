@echo off
title Parakeet AI - Real-Time Technical Interview Copilot
cd /d "%~dp0"

echo =====================================================================
echo   Parakeet AI Copilot - Real-Time Technical Interview Assistant
echo =====================================================================
echo.

REM 1. Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your system PATH!
    echo Please download and install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 2. Check if backend dependencies are installed
if not exist "backend\node_modules" (
    echo [1/3] Installing backend dependencies...
    cd /d "%~dp0backend"
    call npm install
    cd /d "%~dp0"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install backend dependencies.
        pause
        exit /b 1
    )
)

REM 3. Check if frontend production bundle exists
if not exist "frontend\dist\frontend\browser\index.html" (
    echo [2/3] Building frontend production bundle...
    cd /d "%~dp0frontend"
    call npm run build
    cd /d "%~dp0"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to build frontend bundle.
        pause
        exit /b 1
    )
)

REM 4. Clear any stale process currently listening on port 8080
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    echo [CLEANUP] Freeing port 8080 from previous process PID %%p...
    taskkill /F /PID %%p >nul 2>nul
)

REM 5. Locate Google Chrome
set "CHROME_BIN="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
)
if not defined CHROME_BIN (
    if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
        set "CHROME_BIN=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )
)
if not defined CHROME_BIN (
    if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
        set "CHROME_BIN=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
    )
)

if defined CHROME_BIN (
    echo [3/3] Launching Parakeet AI Copilot in Google Chrome...
    start "" "%CHROME_BIN%" "http://localhost:8080"
) else (
    echo [3/3] Launching Parakeet AI Copilot in default browser...
    start "" "http://localhost:8080"
)

echo.
echo =====================================================================
echo   [RUNNING] Server active at http://localhost:8080
echo   [STATUS] Keep this window OPEN while using the application.
echo   [STATUS] To stop the server, press Ctrl+C or close this window.
echo =====================================================================
echo.

cd /d "%~dp0backend"
node server.js

echo.
echo =====================================================================
echo   [STOPPED] Parakeet AI server has stopped.
echo =====================================================================
echo.
pause
