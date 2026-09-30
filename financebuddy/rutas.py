# Dónde están los archivos: el código (también dentro del .exe) y la carpeta de datos del usuario.
#
# Carpeta de datos (la elige el usuario; por defecto Documentos\FinanceBuddy):
#   datos.db              base de datos (SQLite)
#   Importar\Banco\       extractos del banco (Excel/CSV) pendientes de importar
#   Importar\Inversión\   movimientos del bróker (Excel/CSV) pendientes de importar
#   Importar\Procesados\  archivos ya importados
#   Copias\               copias de seguridad automáticas de datos.db
# La ruta elegida se guarda en %APPDATA%\FinanceBuddy\ajustes.json.
import ctypes, io, json, os, sys

CONGELADO = getattr(sys, "frozen", False)
PAQUETE = os.path.join(sys._MEIPASS, "financebuddy") if CONGELADO else os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(PAQUETE, "web")
AJUSTES = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "FinanceBuddy", "ajustes.json")

def documentos():
    """Carpeta Documentos del usuario (aunque esté redirigida a OneDrive)."""
    try:
        buf = ctypes.create_unicode_buffer(260)
        if ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf) == 0 and buf.value: return buf.value
    except Exception: pass
    return os.path.join(os.path.expanduser("~"), "Documents")

def carpeta_por_defecto():
    return os.path.join(documentos(), "FinanceBuddy")

def leer_ajustes():
    try:
        with io.open(AJUSTES, encoding="utf-8") as fh: return json.load(fh)
    except Exception: return {}

def guardar_ajustes(a):
    os.makedirs(os.path.dirname(AJUSTES), exist_ok=True)
    with io.open(AJUSTES, "w", encoding="utf-8") as fh: fh.write(json.dumps(a, ensure_ascii=False, indent=1))

class Carpeta:
    """Rutas dentro de la carpeta de datos (y las crea)."""
    def __init__(self, raiz):
        self.raiz = os.path.abspath(raiz)
        self.db = os.path.join(self.raiz, "datos.db")
        self.importar = os.path.join(self.raiz, "Importar")
        self.banco = os.path.join(self.importar, "Banco")
        self.inversion = os.path.join(self.importar, "Inversión")
        self.procesados = os.path.join(self.importar, "Procesados")
        self.copias = os.path.join(self.raiz, "Copias")
        for d in (self.raiz, self.banco, self.inversion, self.procesados, self.copias): os.makedirs(d, exist_ok=True)

    def carpeta_import(self, tipo):
        return self.banco if tipo == "banco" else self.inversion if tipo == "inversion" else self.importar
