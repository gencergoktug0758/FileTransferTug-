@echo off
echo ========================================
echo    FileTransferTug - Ngrok Başlatıcı
echo ========================================
echo.

REM Ngrok token'ını ayarla
ngrok config add-authtoken 337sWlMxwR5pumyJG75rtrY9JHT_4FBz63xyFqkHPm7U6AhwM

echo.
echo Token ayarlandı!
echo.

REM Node.js sunucusunu başlat
echo Node.js sunucusu başlatılıyor...
start "FileTransferTug Server" cmd /k "node server.js"

REM 3 saniye bekle (sunucu başlasın diye)
timeout /t 3 /nobreak >nul

echo.
echo Ngrok tüneli başlatılıyor...
echo.

REM Ngrok ile tünel oluştur
ngrok http 3000

echo.
echo ========================================
echo    Tünel başlatıldı!
echo    Web tarayıcınızda ngrok URL'sini açın
echo ========================================
pause
