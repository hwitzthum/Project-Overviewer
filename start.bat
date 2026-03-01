@echo off
REM Project Overviewer Startup Script (Windows)

echo ========================================
echo     Project Overviewer Startup
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo X Node.js is not installed!
    echo   Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo √ Node.js found: %NODE_VERSION%

REM Check if node_modules exists
if not exist "node_modules" (
    echo.
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo X Failed to install dependencies
        pause
        exit /b 1
    )
    echo √ Dependencies installed
)

echo.
echo Starting Project Overviewer...
echo.

REM Start the server
call npm start
