@echo off
rem Jalankan Ronda Bareng untuk pameran (offline). Klik ganda file ini.
rem Syarat: Node.js terpasang dan folder dist\ sudah dibuat dengan "npm run build".
cd /d "%~dp0"
if not exist dist\index.html (
  echo Folder dist belum ada. Membuat build sekali...
  call npm run build || goto :gagal
)
node scripts\serve-dist.mjs --open
goto :eof

:gagal
echo Build gagal. Pastikan sudah menjalankan "npm install" sekali saat masih ada internet.
pause
