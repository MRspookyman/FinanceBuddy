# Arranque de FinanceBuddy: abre la carpeta de datos, levanta el servidor local y abre el navegador.
#
# Uso: FinanceBuddy.exe  |  python -m financebuddy [--datos CARPETA] [--puerto N] [--sin-navegador]
#                                                  [--ejemplo] [--hoy AAAA-MM-DD] [--pruebas]
#   --ejemplo  usa una carpeta temporal con datos ficticios (para probar la app sin tocar tus datos)
#   --hoy      fija la fecha de «hoy» (pruebas)
#
# Si algo impide arrancar (la carpeta de datos no se puede abrir, el archivo está dañado, el puerto está ocupado por otro
# programa), se explica en un cuadro de Windows: el .exe no tiene consola y antes se cerraba sin decir nada.
import argparse, ctypes, json, os, sys, tempfile, threading, urllib.request, webbrowser

SI = 6  # el botón «Sí» de un cuadro con dos botones (IDYES)
AUTOMATICO = False  # con --sin-navegador (pruebas, scripts) no se abre ningún cuadro: nadie lo podría cerrar

def decir(texto, titulo="FinanceBuddy", preguntar=False):
    """Enseña un mensaje al usuario: cuadro de Windows (el .exe no tiene consola) y, si la hay, también por consola.
    `preguntar`: botones Sí/No → True si pulsa «Sí»."""
    try: print(texto, file=sys.stderr)
    except Exception: pass
    if AUTOMATICO: return False
    try:
        estilo = (0x04 | 0x20) if preguntar else (0x00 | 0x30)  # Sí/No con icono de pregunta · Aceptar con icono de aviso
        return ctypes.windll.user32.MessageBoxW(None, texto, titulo, estilo) == SI
    except Exception:
        return False  # fuera de Windows (o sin interfaz): sin cuadro, el mensaje ya ha salido por consola

def _bandeja(url, srv, app=None):
    """Icono en la bandeja de Windows: se ve que la app sigue en marcha y se puede abrir o cerrar desde ahí (opcional: sin pystray, no pasa nada).
    Con `app`, el icono enseña además los avisos de Windows (recordar.py), si el usuario los ha activado en Ajustes."""
    try:
        import pystray
        from PIL import Image
        from . import rutas
        icono = Image.open(os.path.join(os.path.dirname(rutas.PAQUETE), "recursos", "icono.ico")) if os.path.exists(os.path.join(os.path.dirname(rutas.PAQUETE), "recursos", "icono.ico")) else Image.new("RGB", (64, 64), "#4A7052")
        def salir(ic, _=None):
            ic.stop(); threading.Thread(target=srv.shutdown, daemon=True).start()
        menu = pystray.Menu(pystray.MenuItem("Abrir FinanceBuddy", lambda ic, _=None: webbrowser.open(url), default=True), pystray.MenuItem("Cerrar FinanceBuddy", salir))
        ic = pystray.Icon("FinanceBuddy", icono, "FinanceBuddy (en marcha)", menu)
        ic.run_detached()
        if app is not None:
            from . import recordar
            recordar.vigilar(app, lambda texto: ic.notify(texto, "FinanceBuddy"))
    except Exception:
        pass

def _reparar(raiz, error, dialogo=None):
    """El archivo de datos está dañado: ofrece volver a la última copia de seguridad (la de antes se guarda, no se borra nada).
    → True si se ha restaurado y se puede volver a intentar."""
    from . import almacen, rutas
    dialogo = dialogo or decir
    carpeta = rutas.Carpeta(raiz)
    copia = almacen.ultima_copia(carpeta.copias)
    if not copia:
        dialogo(f"El archivo de datos está dañado y no hay ninguna copia de seguridad para recuperarlo.\n\n{error.ruta}\n({error.causa})\n\n"
                "Si tienes una copia en otro sitio, ponla en esa carpeta con el nombre datos.db. Si no, al volver a abrir la app empezarás de cero.")
        return False
    if not dialogo(f"El archivo de datos está dañado y no se puede abrir:\n{error.ruta}\n({error.causa})\n\n"
                   f"¿Quieres volver a la última copia de seguridad?\n{os.path.basename(copia)}\n\n"
                   "El archivo dañado no se borra: se guarda al lado por si acaso.", preguntar=True):
        return False
    try:
        roto = almacen.restaurar_archivo(carpeta.db, copia)
    except OSError as e:
        dialogo(f"No se ha podido restaurar la copia: {rutas.motivo(e)}.")
        return False
    dialogo(f"Listo: FinanceBuddy sigue con la copia del {os.path.basename(copia)[6:16]}.\n\nEl archivo dañado se ha guardado como:\n{os.path.basename(roto)}")
    return True

def _abrir_app(raiz, a):
    """Abre la carpeta de datos y, si el archivo está dañado, ofrece recuperarlo. → App, o None si no se puede seguir."""
    from . import almacen, rutas, servidor
    for intento in (1, 2):
        try:
            return servidor.App(raiz, hoy=a.hoy, pruebas=a.pruebas, fija=bool(a.datos or a.ejemplo or a.pruebas), ejemplo=a.ejemplo)
        except almacen.BaseDañada as e:
            if intento == 2 or not _reparar(raiz, e): return None
        except almacen.BaseMasNueva as e:
            decir(f"Los datos de esta carpeta los ha guardado una versión más nueva de FinanceBuddy:\n{e.ruta}\n\n"
                  "Esta versión no sabe leerlos y podría estropearlos, así que no los abre. Instala la última versión de FinanceBuddy.")
            return None
        except OSError as e:
            decir(f"No se ha podido abrir la carpeta de datos:\n{raiz}\n\nMotivo: {rutas.motivo(e)}.\n\n"
                  "Comprueba que el disco está conectado y que la carpeta existe. Puedes elegir otra carpeta borrando el archivo:\n" + rutas.AJUSTES)
            return None
        except Exception as e:
            decir(f"FinanceBuddy no ha podido arrancar con los datos de:\n{raiz}\n\n{type(e).__name__}: {e}")
            return None
    return None

def main(argv=None):
    global AUTOMATICO
    if sys.stdout is None: sys.stdout = open(os.devnull, "w")  # .exe sin consola
    if sys.stderr is None: sys.stderr = open(os.devnull, "w")
    from . import rutas, servidor
    ap = argparse.ArgumentParser(prog="FinanceBuddy")
    ap.add_argument("--datos"); ap.add_argument("--puerto", type=int, default=8765)
    ap.add_argument("--sin-navegador", action="store_true"); ap.add_argument("--ejemplo", action="store_true")
    ap.add_argument("--hoy"); ap.add_argument("--pruebas", action="store_true")
    a = ap.parse_args(argv)
    AUTOMATICO = a.sin_navegador
    url = f"http://127.0.0.1:{a.puerto}/"
    # Primero el puerto y después los datos: si ya hay una FinanceBuddy abierta, esta no tiene que tocar su base de datos
    # (dos programas escribiendo a la vez en ella: el segundo se quedaba esperando y acababa en un cuadro de error).
    try:
        srv = servidor.crear(None, a.puerto)
    except OSError:
        # Ya hay una FinanceBuddy abierta en ese puerto: solo abrir el navegador
        try:
            urllib.request.urlopen(url, timeout=2)
            if not a.sin_navegador: webbrowser.open(url)
            return 0
        except Exception:
            decir(f"El puerto {a.puerto} lo está usando otro programa, así que FinanceBuddy no puede abrirse.\n\n"
                  f"Cierra ese programa o abre FinanceBuddy con otro puerto:\nFinanceBuddy.exe --puerto 8766")
            return 1
    if a.ejemplo:
        raiz = a.datos or os.path.join(tempfile.gettempdir(), "FinanceBuddy-ejemplo")
        from . import ejemplo
        ejemplo.crear(raiz, hoy=a.hoy)
    else:
        raiz = a.datos or rutas.leer_ajustes().get("datos") or rutas.carpeta_por_defecto()
    app = _abrir_app(raiz, a)
    if app is None:
        srv.server_close(); return 1
    servidor.Manejador.app = app
    print(f"FinanceBuddy en {url} · datos en {raiz}")
    if not a.sin_navegador: threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    if not a.sin_navegador: _bandeja(url, srv, None if a.ejemplo else app)
    try: srv.serve_forever()
    except KeyboardInterrupt: pass
    return 0

if __name__ == "__main__":
    sys.exit(main())
