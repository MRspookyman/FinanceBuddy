# Punto de entrada del .exe (PyInstaller no admite importaciones relativas en el script principal).
import sys
from financebuddy.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
