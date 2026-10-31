@echo off
title ZimAuth Server (KeyAuth Replica)
echo ====================================================
echo   Starting ZimAuth Server...
echo ====================================================
cd /d "%~dp0"
node server.js
pause
