# Avisos de Windows (opcional, apagado de serie): lo que tiene fecha y lo que toca hacer se ve sin tener la app delante.
# Hace falta que la app esté en marcha (su icono en la bandeja); con «Arrancar con Windows» (autoarranque.py) lo está siempre.
# No sale nada a internet: se mira la base local y el aviso lo enseña el icono de la bandeja (pystray).
import datetime, threading

CADA = 3 * 3600  # segundos entre una mirada y la siguiente
DIAS_SIN_IMPORTAR = 9
REPETIR_IMPORTAR = 7  # días entre un «toca importar» y el siguiente: recordarlo cada día cansa y se acaba apagando todo

def pendientes(alm, hoy=None):
    """Lo que hay que recordar hoy: [(clave, texto)]. La clave sirve para no repetir el mismo aviso el mismo día."""
    hoy = datetime.date.fromisoformat(hoy) if isinstance(hoy, str) else (hoy or datetime.date.today())
    out = []
    for r in alm.todos("recordatorio"):
        if r.get("estado") == "hecho" or not r.get("fecha"): continue
        try: f = datetime.date.fromisoformat(r["fecha"])
        except ValueError: continue
        dias = (f - hoy).days
        antes = r.get("avisar_dias")
        if dias > (14 if antes is None else antes): continue
        cuando = "hoy" if dias == 0 else "mañana" if dias == 1 else f"en {dias} días" if dias > 0 else f"desde el {f.strftime('%d/%m')}"
        out.append((f"recordatorio:{r['id']}", f"{r['nombre']} · {cuando}"))
    fechas = [m["fecha"] for m in alm.todos("movimiento") if m.get("fecha")]
    if fechas:
        try: sin = (hoy - datetime.date.fromisoformat(max(fechas))).days
        except ValueError: sin = 0
        if sin >= DIAS_SIN_IMPORTAR: out.append(("importar", f"Llevas {sin} días sin importar el extracto de tu banco"))
    return out

def _hace(cuando, dia):
    """Días desde que se dijo algo (None si no consta o la fecha no vale)."""
    try: return (datetime.date.fromisoformat(dia) - datetime.date.fromisoformat(cuando)).days
    except (TypeError, ValueError): return None

def _toca(dichos, clave, dia):
    """¿Hay que decirlo hoy? Cada recordatorio, una vez al día; lo de importar, una vez a la semana."""
    d = _hace(dichos.get(clave), dia)
    return d is None or d < 0 or d >= (REPETIR_IMPORTAR if clave == "importar" else 1)

def vigilar(app, avisar, parar=None, espera=20):
    """Cada pocas horas mira qué toca y lo dice con `avisar(texto)`, solo si el ajuste está activado. Cuándo se dijo cada cosa
    se guarda en la base (`avisos_windows_dichos`): cerrar y abrir la app, o reiniciar el ordenador, no lo repite.
    `app`: la servidor.App en marcha (su base puede cambiar si el usuario cambia de carpeta). `espera`: segundos hasta la
    primera mirada (pocos si la ha abierto Windows; si la has abierto tú, ya lo estás viendo en el Inicio). Devuelve el hilo."""
    parar = parar or threading.Event()
    def una_vez():
        try:
            alm = app.alm
            if not alm.config("avisos_windows"): return
            dia = app.hoy or datetime.date.today().isoformat()
            dichos = alm.config("avisos_windows_dichos") or {}
            nuevos = [(k, t) for k, t in pendientes(alm, dia) if _toca(dichos, k, dia)]
            if not nuevos: return
            recientes = {k: v for k, v in dichos.items() if _hace(v, dia) is not None and _hace(v, dia) < REPETIR_IMPORTAR}  # lo más viejo ya no hace falta
            alm.set_config("avisos_windows_dichos", {**recientes, **{k: dia for k, _ in nuevos}})
            avisar(nuevos[0][1] if len(nuevos) == 1 else "\n".join(t for _, t in nuevos[:4]))
        except Exception:
            pass  # un aviso que falla no puede tumbar la app
    def bucle():
        if parar.wait(espera): return  # al arrancar, deja que la app termine de abrirse
        while True:
            una_vez()
            if parar.wait(CADA): return
    h = threading.Thread(target=bucle, daemon=True)
    h.una_vez = una_vez
    h.start()
    return h
