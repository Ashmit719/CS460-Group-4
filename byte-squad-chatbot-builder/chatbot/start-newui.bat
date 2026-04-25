@echo off
setlocal
pushd "%~dp0"
start "Chatbot Builder Server" cmd /c "npx -y http-server -p 8080"
timeout /t 2 >nul
start "" http://localhost:8080/NEWUI.html
popd
endlocal
