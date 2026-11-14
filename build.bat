@echo off
title Rebuild Parakeet AI Frontend
cd /d "%~dp0"

echo =====================================================================
echo   Rebuilding Parakeet AI Production Frontend Bundle...
echo =====================================================================
echo.

call npm run build --prefix frontend

echo.
echo =====================================================================
echo   Build complete! Run 'start.bat' to launch the updated app.
echo =====================================================================
pause

