@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8787 in the browser you want to test.
echo Keep this window open. Press Ctrl+C to stop.
node server.mjs
pause
