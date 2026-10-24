@echo off
setlocal enabledelayedexpansion
title Arcana - Tarot y Oraculo
cd /d "%~dp0"

echo ================================================
echo   Arcana - Tarot y Oraculo
echo ================================================
echo.

rem --- 1. Localizar Node.js -----------------------------------------------
where node >nul 2>nul
if %errorlevel%==0 goto :node_ok

set "NODE_BUNDLED=C:\Users\sagit\.verdent\tools\node-v22.11.0-win-x64"
if exist "%NODE_BUNDLED%\node.exe" (
    echo Node.js no esta en el PATH del sistema; usando la copia local.
    set "PATH=%NODE_BUNDLED%;%PATH%"
    goto :node_ok
)

echo.
echo [ERROR] No se encontro Node.js en esta máquina.
echo Instálalo desde https://nodejs.org ^(version 18 o superior^) y vuelve a intentarlo.
echo.
pause
exit /b 1

:node_ok

rem --- 2. Variables de entorno ---------------------------------------------
if not exist "backend\.env" (
    echo Creando backend\.env por primera vez...
    copy "backend\.env.example" "backend\.env" >nul
)
if not exist "frontend\.env" (
    echo Creando frontend\.env por primera vez...
    copy "frontend\.env.example" "frontend\.env" >nul
)

rem --- 3. Dependencias ------------------------------------------------------
if not exist "node_modules" (
    echo.
    echo Instalando dependencias por primera vez ^(puede tardar unos minutos^)...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Fallo "npm install". Revisa el mensaje de arriba.
        pause
        exit /b 1
    )
)

rem --- 4. Base de datos -------------------------------------------------
rem La base ahora es PostgreSQL en Neon (ver docs\despliegue.md): ya no hay
rem archivo local que crear. Se aplican las migraciones pendientes, si hay.
echo.
echo Revisando la base de datos...
call npm run db:migrate:deploy -w backend

rem --- 5. Arrancar backend + frontend en una ventana aparte -----------------
echo.
echo Iniciando Arcana...
echo   - API:      http://localhost:4000
echo   - Frontend: http://localhost:5173
echo.
echo Se abre una ventana nueva "Arcana - servidores" con los logs.
echo Para apagar la app, cierra esa ventana ^(o esta^).
echo.

start "Arcana - servidores" cmd /k "cd /d "%~dp0" && npm run dev"

echo Esperando a que arranquen los servidores...
timeout /t 6 /nobreak >nul

start "" "http://localhost:5173"

echo.
echo Listo. Si el navegador no abrio solo, entra manualmente a http://localhost:5173
echo Esta ventana se puede cerrar; los servidores siguen en la otra ventana.
echo.
pause
