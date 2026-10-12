@echo off
cd /d "%~dp0"
echo Starting RenewalTrack...
where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
  python -m http.server 3000
  goto :end
)
echo.
echo Node.js or Python is required to run RenewalTrack.
echo Install Node.js (LTS) from https://nodejs.org and double-click start.bat again.
echo.
pause
:end
