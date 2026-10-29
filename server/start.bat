@echo off
rem Starts the Cloudflare tunnel "upwork-alerts" and the alert server.
rem The address never changes: wss://upwork.ljsitsolution.com
rem Double-click to run (also runs at login from the Startup folder).
rem Press Ctrl+C or close the window to stop.
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "ADDRESS=wss://upwork.ljsitsolution.com"
set "TUNNEL=upwork-alerts"

rem Token: from TOKEN env var, else token.txt, else make a new one and save it.
if not defined TOKEN (
  if exist token.txt (
    set /p TOKEN=<token.txt
  ) else (
    for /f %%t in ('node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"') do set "TOKEN=%%t"
    >token.txt echo !TOKEN!
    echo New token saved to token.txt
  )
)

echo.
echo  Token: %TOKEN%
echo.

set "LOG=%TEMP%\upwork-tunnel.log"
if exist "%LOG%" del "%LOG%"

rem http2 (TCP) instead of the default QUIC (UDP), which this network blocks.
echo Starting Cloudflare tunnel...
start "" /b cloudflared tunnel --protocol http2 run --url http://localhost:8787 %TUNNEL% 2>"%LOG%"

rem Wait up to 30 seconds for the first connection to Cloudflare.
set "UP="
for /l %%i in (1,1,30) do (
  if not defined UP (
    ping -n 2 127.0.0.1 >nul
    findstr /c:"Registered tunnel connection" "%LOG%" >nul 2>&1 && set "UP=1"
  )
)
if not defined UP (
  echo Tunnel is not connected yet. It keeps retrying by itself.
  echo If this keeps happening, see %LOG%
)

echo.
echo ==============================================================
echo  Server address:
echo    %ADDRESS%
echo  Token:
echo    %TOKEN%
echo  The extension on the remote PC needs these once. They don't change.
echo ==============================================================
echo.

node server.js

echo Server stopped.
taskkill /im cloudflared.exe /f >nul 2>&1
pause
