@echo off
setlocal enabledelayedexpansion

:: Find the repo — check common locations
if exist "%~dp0..\backend\app\main.py" (
    set "SELFAI_DIR=%~dp0.."
) else if exist "%USERPROFILE%\self.ai\backend\app\main.py" (
    set "SELFAI_DIR=%USERPROFILE%\self.ai"
) else (
    echo Error: Cannot find Self.ai repository.
    echo Expected at %USERPROFILE%\self.ai
    goto :eof
)

set "SELFAI_PORT=8420"
set "PIDFILE=%USERPROFILE%\.selfai\selfai.pid"

if "%~1"=="" goto start
if /i "%~1"=="start" goto start
if /i "%~1"=="stop" goto stop
if /i "%~1"=="status" goto status
if /i "%~1"=="update" goto update
goto usage

:start
    if exist "%PIDFILE%" (
        set /p PID=<"%PIDFILE%"
        tasklist /FI "PID eq !PID!" 2>nul | find /i "python" >nul
        if !errorlevel! equ 0 (
            echo Self.ai is already running (PID: !PID!^)
            echo   http://localhost:%SELFAI_PORT%
            goto :eof
        )
        del "%PIDFILE%" >nul 2>&1
    )

    pushd "%SELFAI_DIR%\backend"

    if not exist ".venv\Scripts\activate.bat" (
        echo Error: Virtual environment not found at %SELFAI_DIR%\backend\.venv
        echo Run the installer first.
        popd
        goto :eof
    )
    call .venv\Scripts\activate.bat

    where uvicorn >nul 2>&1
    if !errorlevel! neq 0 (
        echo Error: uvicorn not found. Backend dependencies may not be installed.
        echo Run the installer first.
        popd
        goto :eof
    )

    start /b "" uvicorn app.main:app --host 127.0.0.1 --port %SELFAI_PORT%
    timeout /t 2 /nobreak >nul

    for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq python.exe" /FO LIST ^| find "PID:"') do (
        set "PID=%%a"
    )

    if not exist "%USERPROFILE%\.selfai" mkdir "%USERPROFILE%\.selfai"
    echo !PID!>"%PIDFILE%"

    python -c "import webbrowser; webbrowser.open('http://localhost:%SELFAI_PORT%')"

    echo Self.ai running at http://localhost:%SELFAI_PORT%
    echo Press Ctrl+C to stop
    popd
    goto :eof

:stop
    if exist "%PIDFILE%" (
        set /p PID=<"%PIDFILE%"
        taskkill /PID !PID! /F >nul 2>&1
        del "%PIDFILE%" >nul 2>&1
        echo Self.ai stopped
    ) else (
        echo Self.ai is not running
    )
    goto :eof

:status
    if exist "%PIDFILE%" (
        set /p PID=<"%PIDFILE%"
        tasklist /FI "PID eq !PID!" 2>nul | find /i "python" >nul
        if !errorlevel! equ 0 (
            echo Self.ai is running (PID: !PID!^)
            echo   http://localhost:%SELFAI_PORT%
        ) else (
            echo Self.ai is not running (stale PID file removed^)
            del "%PIDFILE%" >nul 2>&1
        )
    ) else (
        echo Self.ai is not running
    )
    goto :eof

:update
    set "WAS_RUNNING=false"
    if exist "%PIDFILE%" (
        set /p PID=<"%PIDFILE%"
        tasklist /FI "PID eq !PID!" 2>nul | find /i "python" >nul
        if !errorlevel! equ 0 (
            set "WAS_RUNNING=true"
            echo Stopping Self.ai before update...
            taskkill /PID !PID! /F >nul 2>&1
            del "%PIDFILE%" >nul 2>&1
        )
    )

    pushd "%SELFAI_DIR%"

    echo Pulling latest changes...
    git pull --ff-only
    if !errorlevel! neq 0 (
        echo Error: git pull failed. You may have local changes — commit or stash them first.
        popd
        goto :eof
    )

    echo Updating backend dependencies...
    pushd "%SELFAI_DIR%\backend"
    call .venv\Scripts\activate.bat
    pip install -q -r requirements.txt
    popd

    if exist "%SELFAI_DIR%\frontend\package.json" (
        echo Updating frontend...
        pushd "%SELFAI_DIR%\frontend"
        call npm install --silent
        call npm run build
        popd
    )

    popd

    echo Update complete.

    if "!WAS_RUNNING!"=="true" (
        echo Restarting Self.ai...
        goto start
    )
    goto :eof

:usage
    echo Usage: selfai [start^|stop^|status^|update]
    goto :eof
