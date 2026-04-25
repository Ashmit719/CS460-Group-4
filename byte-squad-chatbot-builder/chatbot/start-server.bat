@echo off
setlocal
pushd "%~dp0"
start "Tiny Transformer Server" cmd /c "npx http-server -p 8000"
start "Tiny Transformer" http://localhost:8000/chatbot.html
popd
endlocal
