@echo off
if not "%1"=="_is_admin" (powershell start -verb runas '%0' _is_admin & exit /b)
%~dp0\winsw.exe install
%~dp0\winsw.exe start
pause
