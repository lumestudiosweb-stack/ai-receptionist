@echo off
title AI Receptionist
echo ========================================
echo   Starting AI Receptionist...
echo ========================================
echo.

cd /d "%~dp0"

:: Start the server in background
start "AI-Receptionist-Server" /min cmd /c "\"C:\Program Files\nodejs\node.exe\" server.js"

:: Wait for server to be ready
timeout /t 3 /noq >nul

:: Start ngrok (stays in foreground so window stays open)
echo Starting ngrok tunnel...
"%USERPROFILE%\AppData\Local\Microsoft\WinGet\Links\ngrok.exe" http 3000
