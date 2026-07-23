@echo off
cd /d "%~dp0"
start http://localhost:8088/index.html?loc=QR-1
python -m http.server 8088
pause
