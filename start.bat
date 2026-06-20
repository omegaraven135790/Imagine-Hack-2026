@echo off
setlocal EnableDelayedExpansion
title ResWatch Retail — Launcher

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║        ResWatch Retail — Launcher        ║
echo  ║   ImagineHack 2026 · Track 3             ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ── Check .env exists ─────────────────────────────────────────────────────────
if not exist ".env" (
    echo  [ERROR] .env file not found.
    echo.
    echo  Copy .env.example to .env and fill in your Supabase credentials:
    echo    copy .env.example .env
    echo.
    pause
    exit /b 1
)

:: ── Check Docker is running ────────────────────────────────────────────────────
docker info >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Docker Desktop is not running.
    echo  Please start Docker Desktop and try again.
    echo.
    pause
    exit /b 1
)

echo  [1/3] Building and starting containers...
docker compose up --build -d
if errorlevel 1 (
    echo.
    echo  [ERROR] Docker Compose failed. Check the output above.
    pause
    exit /b 1
)

:: ── Wait for backend health ────────────────────────────────────────────────────
echo.
echo  [2/3] Waiting for backend to be ready...
set /a attempts=0
:health_check
set /a attempts+=1
if !attempts! GTR 30 (
    echo  [ERROR] Backend did not start in time. Check: docker logs reswatch-retail-backend
    pause
    exit /b 1
)
curl -sf http://localhost:8000/health >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto health_check
)

:: ── Wait for frontend ──────────────────────────────────────────────────────────
echo  [3/3] Waiting for frontend to be ready...
set /a attempts=0
:frontend_check
set /a attempts+=1
if !attempts! GTR 20 (
    echo  [WARN] Frontend check timed out — opening anyway...
    goto open_browser
)
curl -sf http://localhost:3000 >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto frontend_check
)

:open_browser
echo.
echo  ✓ ResWatch Retail is running
echo  ✓ Backend:  http://localhost:8000
echo  ✓ Frontend: http://localhost:3000
echo  ✓ API Docs: http://localhost:8000/docs
echo.
start "" http://localhost:3000
echo  Press any key to stop the app (or close this window to keep it running).
pause >nul

echo.
echo  Stopping containers...
docker compose down
echo  Done.
