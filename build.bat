@echo off
rem Genera dist\FinanceBuddy.exe (un solo archivo, sin ventana de consola).
rem Requisitos: Python 3.10+. Los componentes (requirements.txt y requirements-dev.txt) se instalan solos si faltan.
cd /d "%~dp0"

rem 1) Componentes: openpyxl y xlrd (Excel), pypdf (X-Ray en PDF), PyInstaller (el .exe)
python -c "import openpyxl, xlrd, pypdf, PyInstaller" 2>nul
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
python -m unittest pruebas.test_importar pruebas.test_servidor
if errorlevel 1 (
  echo.
  echo Las pruebas fallan: no se genera el .exe. Arriba tienes el detalle de cada error.
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
python -m PyInstaller --noconfirm --clean --onefile --windowed --name FinanceBuddy ^
  --icon recursos\icono.ico ^
  --add-data "financebuddy\web;financebuddy\web" ^
  --hidden-import openpyxl --hidden-import xlrd --hidden-import pypdf ^
  --exclude-module tkinter --exclude-module PIL --exclude-module cryptography --exclude-module numpy ^
  lanzar.py
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Listo: dist\FinanceBuddy.exe
pause
