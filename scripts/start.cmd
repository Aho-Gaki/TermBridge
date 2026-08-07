@echo off
rem Run TermBridge in a visible console (useful for checking its output).
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\start.ps1"
