# Abre cada pantalla en Edge sin ventana (headless) contra un servidor con datos de ejemplo y muestra los errores de
# la página (#log). Con --tests ejecuta además las pruebas de cálculos (pruebas_calculos.js).
#
# Uso: python pruebas/run.py [pantalla1,pantalla2] [--tests] [--shot] [--tema=oscuro] [--ancho=N] [--alto=N] [--datos=CARPETA]
#   --capturas: captura cada pantalla en claro y en oscuro (para repasar de un vistazo que ninguna se ha roto)
#   --datos: usa esa carpeta de datos en lugar de crear una de ejemplo (p. ej. para ver tus datos reales)
#   FB_NAVEGADOR: ruta de otro Chrome/Chromium (p. ej. fuera de Windows)
import html, os, re, subprocess, sys, tempfile, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(tempfile.gettempdir(), "fb-pruebas")
# Navegadores con modo sin ventana (el primero que exista)
EDGES = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
         r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]
PANTALLAS = "inicio,movimientos,inversion,importar,revisar,apuntar,cerrar,valores,ajustes,fijos,gestionar/movimiento,gestionar/cuenta,editar/movimiento/nuevo,editar/recurrente/nuevo,revision,renta,bienvenida,gestionar/categoria,editar/regla/nuevo,ajustes/datos"
HOY = "2026-09-30"

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = dict(a[2:].split("=", 1) if "=" in a else (a[2:], "1") for a in sys.argv[1:] if a.startswith("--"))
    pantallas = (args[0] if args else PANTALLAS).split(",")
    edge = next((e for e in [os.environ.get("FB_NAVEGADOR", "")] + EDGES if e and os.path.exists(e)), None)
    if not edge: sys.exit("No encuentro Chrome ni Edge (o indica otro con la variable FB_NAVEGADOR).")
    os.makedirs(SALIDA, exist_ok=True)
    puerto = int(flags.get("puerto", 8799))
    cmd = [sys.executable, "-m", "financebuddy", "--sin-navegador", "--puerto", str(puerto), "--hoy", flags.get("hoy", HOY), "--pruebas"]
    if "datos" in flags: cmd += ["--datos", flags["datos"]]
    else: cmd += ["--ejemplo", "--datos", os.path.join(SALIDA, "datos")]
    srv = subprocess.Popen(cmd, cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            try: urllib.request.urlopen(f"http://127.0.0.1:{puerto}/", timeout=1); break
            except Exception: time.sleep(0.1)
        else: sys.exit("El servidor no arranca: " + srv.stderr.read().decode(errors="replace")[-2000:])
        perfil = tempfile.mkdtemp()
        fallos = 0
        for i, v in enumerate(pantallas):
            qs = "&".join((["pruebas=1"] if "tests" in flags and i == 0 else []) + (["tema=" + flags["tema"]] if "tema" in flags else []))
            url = f"http://127.0.0.1:{puerto}/{'?' + qs if qs else ''}#{v}"
            base = [edge, "--headless", "--disable-gpu", "--no-first-run", f"--user-data-dir={perfil}", "--virtual-time-budget=6000"]
            if os.name != "nt": base.append("--no-sandbox")
            out = subprocess.run(base + ["--dump-dom", url], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120).stdout
            m = re.search(r'<div id="log">(.*?)</div>', out, re.S)
            texto = html.unescape(m.group(1)).strip() if m else "(sin log)"
            h2 = re.search(r"<h2[^>]*>(.*?)</h2>", out, re.S)
            if not out.strip(): texto = "(el navegador no devolvió la página)"
            if "Error" in texto or "✕" in texto or not out.strip(): fallos += 1
            print(f"── {v} [{html.unescape(h2.group(1)) if h2 else '—'}]: {texto or 'ok'}")
            tam = f"--window-size={flags.get('ancho', '1440' if 'capturas' in flags else '1200')},{flags.get('alto', '2600')}"
            if "shot" in flags:
                png = os.path.join(SALIDA, f"{v.replace('/', '-')}{'-' + flags['tema'] if 'tema' in flags else ''}.png")
                subprocess.run(base + [tam, f"--screenshot={png}", url], capture_output=True, timeout=120)
            if "capturas" in flags:  # ?tema= fuerza el tema solo en esa carga (nucleo.js)
                for tema in ("claro", "oscuro"):
                    png = os.path.join(SALIDA, f"{v.replace('/', '-')}-{tema}.png")
                    subprocess.run(base + [tam, "--hide-scrollbars", f"--screenshot={png}", f"http://127.0.0.1:{puerto}/?tema={tema}#{v}"], capture_output=True, timeout=120)
        if "shot" in flags or "capturas" in flags: print("capturas en", SALIDA)
        return 1 if fallos else 0
    finally:
        srv.terminate()

if __name__ == "__main__":
    sys.exit(main())
