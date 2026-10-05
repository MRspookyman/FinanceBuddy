# Arranque de FinanceBuddy: abre la carpeta de datos, levanta el servidor local y abre el navegador.
#
# Uso: FinanceBuddy.exe  |  python -m financebuddy [--datos CARPETA] [--puerto N] [--sin-navegador]
#                                                  [--ejemplo] [--hoy AAAA-MM-DD] [--pruebas]
#   --ejemplo  usa una carpeta temporal con datos ficticios (para probar la app sin tocar tus datos)
#   --hoy      fija la fecha de «hoy» (pruebas)
import argparse, json, os, sys, tempfile, threading, urllib.request, webbrowser

def _bandeja(url, srv):
    """Icono en la bandeja de Windows: se ve que la app sigue en marcha y se puede abrir o cerrar desde ahí (opcional: sin pystray, no pasa nada)."""
    try:
        import pystray
        from PIL import Image
        from . import rutas
        icono = Image.open(os.path.join(os.path.dirname(rutas.PAQUETE), "recursos", "icono.ico")) if os.path.exists(os.path.join(os.path.dirname(rutas.PAQUETE), "recursos", "icono.ico")) else Image.new("RGB", (64, 64), "#4A7052")
        def salir(ic, _=None):
            ic.stop(); threading.Thread(target=srv.shutdown, daemon=True).start()
        menu = pystray.Menu(pystray.MenuItem("Abrir FinanceBuddy", lambda ic, _=None: webbrowser.open(url), default=True), pystray.MenuItem("Cerrar FinanceBuddy", salir))
        pystray.Icon("FinanceBuddy", icono, "FinanceBuddy (en marcha)", menu).run_detached()
    except Exception:
        pass

def main(argv=None):
    if sys.stdout is None: sys.stdout = open(os.devnull, "w")  # .exe sin consola
    if sys.stderr is None: sys.stderr = open(os.devnull, "w")
    from . import rutas, servidor
    ap = argparse.ArgumentParser(prog="FinanceBuddy")
    ap.add_argument("--datos"); ap.add_argument("--puerto", type=int, default=8765)
    ap.add_argument("--sin-navegador", action="store_true"); ap.add_argument("--ejemplo", action="store_true")
    ap.add_argument("--hoy"); ap.add_argument("--pruebas", action="store_true")
    a = ap.parse_args(argv)
    url = f"http://127.0.0.1:{a.puerto}/"
    if a.ejemplo:
        raiz = a.datos or os.path.join(tempfile.gettempdir(), "FinanceBuddy-ejemplo")
        from . import ejemplo
        ejemplo.crear(raiz, hoy=a.hoy)
    else:
        raiz = a.datos or rutas.leer_ajustes().get("datos") or rutas.carpeta_por_defecto()
    try:
        app = servidor.App(raiz, hoy=a.hoy, pruebas=a.pruebas)
        app.ejemplo = a.ejemplo
        srv = servidor.crear(app, a.puerto)
    except OSError:
        # Ya hay una FinanceBuddy abierta en ese puerto: solo abrir el navegador
        try:
            urllib.request.urlopen(url, timeout=2)
            if not a.sin_navegador: webbrowser.open(url)
            return 0
        except Exception:
            print(f"El puerto {a.puerto} está ocupado por otro programa. Prueba con --puerto 8766.", file=sys.stderr)
            return 1
    print(f"FinanceBuddy en {url} · datos en {raiz}")
    if not a.sin_navegador: threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    if not a.sin_navegador: _bandeja(url, srv)
    try: srv.serve_forever()
    except KeyboardInterrupt: pass
    return 0

if __name__ == "__main__":
    sys.exit(main())
