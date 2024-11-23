@echo off
if exist "%SYSTEMDRIVE%\Program Files (x86)\" (
    :: is 64-bit
    if not exist %~dp0\..\node_modules\@parcel\watcher-win32-x64 move %~dp0\..\node_modules\@parcel\watcher\node_modules\@parcel\watcher-win32-x64 %~dp0\..\node_modules\@parcel
) else (
    :: is 32-bit
    if not exist %~dp0\..\node_modules\@parcel\watcher-win32-arm64 move %~dp0\..\node_modules\@parcel\watcher\node_modules\@parcel\watcher-win32-arm64 %~dp0\..\node_modules\@parcel
)
node %~dp0\..\dist\bundle.js --dev %*