# Avisos de Windows (opcional, apagado de serie): lo que tiene fecha y lo que toca hacer se ve aunque no abras la app.
# No sale nada a internet: se mira la base local y el aviso lo enseña el icono de la bandeja (pystray).
import datetime, threading

CADA = 3 * 3600  # segundos entre una mirada y la siguiente
DIAS_SIN_IMPORTAR = 9

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

def vigilar(app, avisar, parar=None):
    """Cada pocas horas mira qué toca y lo dice con `avisar(texto)`: cada cosa, una vez al día y solo si el ajuste está activado.
    `app`: la servidor.App en marcha (su base puede cambiar si el usuario cambia de carpeta). Devuelve el hilo."""
    parar = parar or threading.Event()
    dichos = set()
    def una_vez():
        try:
            alm = app.alm
            if not alm.config("avisos_windows"): return
            dia = app.hoy or datetime.date.today().isoformat()
            nuevos = [(k, t) for k, t in pendientes(alm, dia) if (dia, k) not in dichos]
            if not nuevos: return
            dichos.update((dia, k) for k, _ in nuevos)
            avisar(nuevos[0][1] if len(nuevos) == 1 else "\n".join(t for _, t in nuevos[:4]))
        except Exception:
            pass  # un aviso que falla no puede tumbar la app
    def bucle():
        if parar.wait(20): return  # al arrancar, deja que la app termine de abrirse
        while True:
            una_vez()
            if parar.wait(CADA): return
    h = threading.Thread(target=bucle, daemon=True)
    h.una_vez = una_vez
    h.start()
    return h
