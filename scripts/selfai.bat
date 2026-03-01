@echo off
setlocal enabledelayedexpansion

set "SELFAI_DIR=%~dp0.."
set "SELFAI_PORT=8420"
set "PIDFILE=%USERPROFILE%\.selfai\selfai.pid"

if "%~1"=="" goto start
if /i "%~1"=="start" goto start
if /i "%~1"=="stop" goto stop
if /i "%~1"=="status" goto status
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
    call .venv\Scripts\activate.bat

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

:usage
    echo Usage: selfai [start^|stop^|status]
    goto :eof
