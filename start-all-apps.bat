@echo off
chcp 65001 > nul
echo ========================================================
echo   내 업무 포털 및 6개 독립 앱 일괄 구동 시스템
echo ========================================================
echo.
echo [1/7] Port 3000: 내 업무 포털 메인 (Hub Portal) 구동 중...
start "Hub Portal [3000]" cmd /k "cd /d D:\projects\workspace-portal && npm run dev"

echo [2/7] Port 3001: 쇼핑몰 일일 정산 관리기 구동 중...
start "Daily Calculator [3001]" cmd /k "cd /d D:\projects\daily calculator && npm run dev"

echo [3/7] Port 3002: 네이버/쿠팡 가격 모니터링 구동 중...
start "Monitoring [3002]" cmd /k "cd /d D:\projects\monitering && npm run dev"

echo [4/7] Port 3003: 압력밥솥 CRM 고객 관리기 구동 중...
start "CRM [3003]" cmd /k "cd /d D:\projects\pressure-cooker-crm && npm run dev"

echo [5/7] Port 3004: 일정 관리 & 업무 다이어리 구동 중...
start "Schedule [3004]" cmd /k "cd /d D:\projects\daily-schedule-new && npm run dev"

echo [6/7] Port 3005: 쿠팡 로켓 마진 계산기 구동 중...
start "Rocket Calc [3005]" cmd /k "cd /d D:\projects\roket margin calculator && npm run dev"

echo [7/7] Port 3006: 상가 부가세 계산기 구동 중...
start "Surtax Market [3006]" cmd /k "cd /d D:\projects\surtax-market && npm run dev"

echo.
echo ========================================================
echo  모든 앱이 각각의 독립 포트(3000~3006)에서 구동되었습니다!
echo  웹 브라우저에서 http://localhost:3000 접속하시면 포털 메인을 사용하실 수 있습니다.
echo ========================================================
pause
