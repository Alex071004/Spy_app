@echo off
rem SpyApp: запуск свежей версии из main одним кликом (сайт :5173 + API :4000).
rem Работает в отдельной папке .preview, чтобы не трогать рабочие копии агентов.
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where pnpm >nul 2>nul || (echo [SpyApp] Не найден pnpm. Установите командой: npm i -g pnpm & pause & exit /b 1)

echo [SpyApp] Скачиваю свежую версию main с GitHub...
git fetch origin main || echo [SpyApp] Нет связи с GitHub, запускаю последнюю скачанную версию.
if not exist ".preview\.git" (
  git worktree add --detach .preview origin/main || goto :fail
) else (
  git -C .preview checkout --detach --force origin/main || goto :fail
)

rem Настройки берутся из .env в корне проекта
if not exist ".env" copy ".env.example" ".env" >nul
copy /y ".env" ".preview\.env" >nul

cd .preview
echo [SpyApp] Ставлю зависимости...
call pnpm install --frozen-lockfile || goto :fail

echo.
echo [SpyApp] Сайт: http://localhost:5173   API: http://localhost:4000/health
echo [SpyApp] Остановить: Ctrl+C в этом окне.
echo.
if not defined SPYAPP_NO_BROWSER start "" cmd /c "timeout /t 8 >nul & start http://localhost:5173"
call pnpm dev
goto :eof

:fail
echo.
echo [SpyApp] Не удалось запустить, подробности выше.
pause
exit /b 1
