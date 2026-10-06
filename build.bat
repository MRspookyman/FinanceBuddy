@echo off
rem Genera dist\FinanceBuddy.exe (carpeta con el .exe, sin ventana de consola; mejor para los antivirus que un solo archivo).
rem Requisitos: Python 3.10+. Los componentes (requirements.txt y requirements-dev.txt) se instalan solos si faltan.
cd /d "%~dp0"

rem 1) Componentes: openpyxl y xlrd (Excel), PyInstaller (el .exe)
python -c "import openpyxl, xlrd, PyInstaller, pystray" 2>nul
if errorlevel 1 (
  echo Faltan componentes de Python: instalandolos...
  python -m pip install -r requirements.txt -r requirements-dev.txt
  if errorlevel 1 (
    echo.
    echo No se han podido instalar. Prueba a mano:  python -m pip install -r requirements.txt -r requirements-dev.txt
    pause
    exit /b 1
  )
)

rem 2) Pruebas (si fallan, se muestra el detalle y no se genera el .exe)
rem    Todas las de Python: cualquier archivo pruebas\test_*.py entra solo, sin tener que apuntarlo aqui.
python -m unittest discover -s pruebas -p "test_*.py" -t .
if errorlevel 1 (
  echo.
  echo Las pruebas fallan: no se genera el .exe. Arriba tienes el detalle de cada error.
  pause
  exit /b 1
)

rem    Y las del navegador: que cada pantalla se dibuje sin errores, los calculos y los flujos con clics.
rem    Si no hay Chrome ni Edge con que probar (codigo 3), se avisa y se sigue.
python pruebas\run.py --tests
if errorlevel 3 (
  echo AVISO: sin navegador no se han podido probar las pantallas.
) else if errorlevel 1 (
  echo.
  echo Alguna pantalla da error: no se genera el .exe.
  pause
  exit /b 1
)
python pruebas\run.py --flujos
if errorlevel 3 (
  echo AVISO: sin navegador no se han podido probar los flujos.
) else if errorlevel 1 (
  echo.
  echo Algun flujo de la app falla: no se genera el .exe.
  pause
  exit /b 1
)

rem 3) El .exe (si FinanceBuddy sigue abierto, Windows no deja reemplazarlo: se cierra antes)
tasklist /fi "imagename eq FinanceBuddy.exe" 2>nul | find /i "FinanceBuddy.exe" >nul
if not errorlevel 1 (
  echo FinanceBuddy esta abierto: cerrandolo para poder generar el .exe nuevo...
  taskkill /im FinanceBuddy.exe /f >nul 2>&1
  timeout /t 2 /nobreak >nul
)
python -m PyInstaller --noconfirm --clean --onedir --windowed --name FinanceBuddy ^
  --icon recursos\icono.ico ^
  --add-data "financebuddy\web;financebuddy\web" ^
  --add-data "recursos\icono.ico;recursos" ^
  --hidden-import openpyxl --hidden-import xlrd --hidden-import pystray ^
  --exclude-module tkinter --exclude-module cryptography --exclude-module numpy ^
  lanzar.py
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Listo: dist\FinanceBuddy\FinanceBuddy.exe (comprime la carpeta FinanceBuddy en un zip para compartirla)
pause
