@echo off
setlocal

REM Terminate existing processes on port 3000 and 5000 to prevent collisions
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do (
    echo Stopping process %%a using port 3000...
    taskkill /F /PID %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5000 .*LISTENING"') do (
    echo Stopping process %%a using port 5000...
    taskkill /F /PID %%a >nul 2>nul
)

echo.
echo Starting Employee Portal on Port 3000...
start "Tech Turf Employee Portal (Port 3000)" cmd /k "set PORT=3000&& cd project && node backend/index.js"

echo Starting Client Connect Portal on Port 5000...
start "Tech Turf Client Portal (Port 5000)" cmd /k "set PORT=5000&& cd project && node backend/index.js"

echo.
echo Both servers have been initiated.
echo - Employee Portal: http://localhost:3000
echo - Client Connect: http://localhost:5000
echo.

pause
endlocal

