@echo off
title Create Desktop Shortcut
cd /d "%~dp0"

echo =====================================================================
echo   Creating Desktop Shortcut for Parakeet AI Copilot...
echo =====================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $s = $ws.CreateShortcut([IO.Path]::Combine($desktop, 'Parakeet AI Copilot.lnk')); $s.TargetPath = '%~dp0start.bat'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = 'shell32.dll,14'; $s.Description = 'Parakeet AI Real-Time Interview Copilot'; $s.Save()"

if exist "%USERPROFILE%\Desktop\Parakeet AI Copilot.lnk" (
    echo [SUCCESS] "Parakeet AI Copilot" shortcut has been created on your Desktop!
    echo You can now launch the application directly from your Desktop anytime.
) else (
    echo [NOTE] You can also right-click 'start.bat' in this folder and select:
    echo        "Send to" -> "Desktop (create shortcut)"
)

echo.
pause
