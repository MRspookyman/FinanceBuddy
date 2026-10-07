# Arrancar con Windows (OPCIONAL, apagado de serie): una entrada en las «aplicaciones de inicio» del usuario que abre la app en la
# bandeja, sin navegador, para que los avisos de Windows (recordar.py) lleguen aunque no la hayas abierto tú.
# Es un valor en el registro del usuario (HKCU\…\Run: no pide permisos de administrador). Se quita desde Ajustes o desde el
# Administrador de tareas de Windows. Solo la app instalada (el .exe) con tus datos de siempre: ni desde el código fuente ni
# desde una app de pruebas o de ejemplo, que no deben tocar tu Windows.
import sys
from . import rutas

CLAVE = r"Software\Microsoft\Windows\CurrentVersion\Run"
NOMBRE = "FinanceBuddy"

def orden():
    """Lo que Windows ejecuta al iniciar sesión, o None si esto no es el .exe."""
    return f'"{sys.executable}" --bandeja' if rutas.CONGELADO else None

def _leer():
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, CLAVE) as k: return winreg.QueryValueEx(k, NOMBRE)[0]
    except (ImportError, OSError):
        return None

def estado(fija=False):
    """Para la página: {disponible, activo, motivo}. `activo`: Windows arranca ESTA app (una entrada que apunta a otra carpeta no cuenta)."""
    o = orden()
    if fija: return {"disponible": False, "activo": False, "motivo": "No se puede cambiar con datos de ejemplo ni desde una app de pruebas."}
    if not o: return {"disponible": False, "activo": False, "motivo": "Solo en la app instalada (FinanceBuddy.exe)."}
    return {"disponible": True, "activo": _leer() == o, "motivo": ""}

def poner(activar, fija=False):
    """Pone o quita la entrada. → el estado nuevo. ValueError (con el motivo) si aquí no se puede."""
    e = estado(fija)
    if not e["disponible"]: raise ValueError(e["motivo"])
    import winreg
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, CLAVE) as k:
            if activar: winreg.SetValueEx(k, NOMBRE, 0, winreg.REG_SZ, orden())
            else:
                try: winreg.DeleteValue(k, NOMBRE)
                except FileNotFoundError: pass
    except OSError as err:
        raise ValueError(f"Windows no ha dejado cambiarlo: {rutas.motivo(err)}.")
    return estado(fija)

def al_dia(fija=False):
    """Al abrir la app: si estaba puesto pero apunta a otro sitio (moviste la carpeta de la app), que apunte a esta."""
    o = orden()
    if fija or not o: return
    v = _leer()
    if v and v != o:
        try: poner(True)
        except ValueError: pass
