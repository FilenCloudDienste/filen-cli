@echo off
if not exist %~dp0\..\node_modules\@parcel\watcher-win32-x64 move %~dp0\..\node_modules\@parcel\watcher\node_modules\@parcel\watcher-win32-x64 %~dp0\..\node_modules\@parcel
node %~dp0\..\dist\bundle.js --dev %*