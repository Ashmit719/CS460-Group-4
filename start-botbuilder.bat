@echo off
title BotBuilder - PROD Mode
setlocal

echo ================================
echo Starting BotBuilder (PROD)
echo ================================

REM Step 1 - Check Java
java -version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Java is not installed or not in PATH.
    pause
    exit /b 1
)

REM Step 2 - Check Maven Wrapper
if not exist mvnw.cmd (
    echo ERROR: mvnw.cmd not found in project root.
    pause
    exit /b 1
)

REM Step 3 - Start Spring Boot in a new terminal
echo Starting Spring Boot (PROD profile)...
start "BotBuilder PROD" cmd /k mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=prod

REM Step 4 - Wait until app is actually reachable
echo Waiting for application to become available...

set APP_URL=http://localhost:8080/index.html
set MAX_TRIES=30
set TRY_COUNT=0

:wait_loop
set /a TRY_COUNT+=1

powershell -Command ^
    "try { $r = Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { exit 0 } else { exit 1 } } catch { exit 1 }"

if %ERRORLEVEL% EQU 0 goto open_browser

if %TRY_COUNT% GEQ %MAX_TRIES% goto startup_failed

timeout /t 2 >nul
goto wait_loop

:open_browser
echo Application is ready. Opening browser...
start %APP_URL%
echo ================================
echo BotBuilder started successfully
echo ================================
pause
exit /b 0

:startup_failed
echo ERROR: Application did not become ready in time.
echo Please check the Spring Boot terminal for errors.
pause
exit /b 1