@echo off
rem Genera dist\FinanceBuddy.exe (un solo archivo, sin ventana de consola).
rem Requisitos: Python 3.10+ y  pip install -r requirements.txt -r requirements-dev.txt
cd /d "%~dp0"
python -m unittest pruebas.test_importar pruebas.test_servidor || (echo Las pruebas fallan: no se genera el .exe & exit /b 1)
python -m PyInstaller --noconfirm --clean --onefile --windowed --name FinanceBuddy ^
  --icon recursos\icono.ico ^
  --add-data "financebuddy\web;financebuddy\web" ^
  --hidden-import openpyxl --hidden-import xlrd ^
  --exclude-module tkinter --exclude-module PIL ^
  lanzar.py || exit /b 1
echo.
echo Listo: dist\FinanceBuddy.exe
