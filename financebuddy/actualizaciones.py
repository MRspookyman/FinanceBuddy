# Aviso de versión nueva (OPCIONAL, apagado de serie): si lo activas, la app pregunta a GitHub cuál es la última versión publicada
# (una consulta pública, sin enviar nada tuyo) y te avisa si es más nueva que la que usas. No descarga ni instala nada: te lleva
# a la página de la versión. Como máximo una consulta al día. Con FB_ACTUALIZACIONES_URL (pruebas) va a un servidor falso.
import datetime, json, os, re, urllib.error, urllib.request
from . import VERSION

URL = "https://api.github.com/repos/MRspookyman/FinanceBuddy/releases/latest"
HORAS = 24

class ErrorActualizacion(Exception):
    pass

def config(alm):
    c = alm.config("actualizaciones") or {}
    return {"activo": bool(c.get("activo", False)), "ultima": c.get("ultima"), "resultado": c.get("resultado")}

def guardar_config(alm, d):
    c = dict(alm.config("actualizaciones") or {})
    if "activo" in d: c["activo"] = bool(d["activo"])
    alm.set_config("actualizaciones", c)

def para_la_pagina(alm):
    c = config(alm)
    viejo = c["activo"] and (not c["ultima"] or datetime.datetime.now() - datetime.datetime.fromisoformat(c["ultima"]) > datetime.timedelta(hours=HORAS))
    return {**c, "version": VERSION, "viejo": bool(viejo)}

def _tupla(v):
    """«v1.2.3» o «1.2» → (1, 2, 3). Lo que no son números se ignora."""
    return tuple(int(x) for x in re.findall(r"\d+", str(v or "").split("-")[0])[:4]) or (0,)

def es_mas_nueva(otra, actual=VERSION):
    a, b = _tupla(otra), _tupla(actual)
    n = max(len(a), len(b))
    return a + (0,) * (n - len(a)) > b + (0,) * (n - len(b))

def comprobar(alm, forzar=False):
    """Pregunta a GitHub y guarda el resultado: {nueva, version, url, notas, comprobado, mensaje}. Lanza ErrorActualizacion si
    está desactivado o no hay conexión."""
    c = config(alm)
    if not c["activo"]: raise ErrorActualizacion("El aviso de versiones está desactivado (Ajustes → FinanceBuddy).")
    if not forzar and c["resultado"] and not para_la_pagina(alm)["viejo"]: return c["resultado"]
    try:
        req = urllib.request.Request(os.environ.get("FB_ACTUALIZACIONES_URL") or URL, headers={"User-Agent": f"FinanceBuddy/{VERSION}", "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=8) as r: d = json.loads(r.read().decode("utf-8", "replace"))
        r = {"nueva": False, "mensaje": ""}
        tag = str(d.get("tag_name") or "")
        if tag:
            r.update(version=re.sub(r"^v", "", tag), url=str(d.get("html_url") or ""), notas=str(d.get("body") or "")[:600], nueva=es_mas_nueva(tag))
            r["mensaje"] = f"Hay una versión nueva: {r['version']} (usas la {VERSION})." if r["nueva"] else f"Usas la última versión ({VERSION})."
        else: r["mensaje"] = "No hay versiones publicadas."
    except urllib.error.HTTPError as e:
        if e.code != 404: raise ErrorActualizacion(f"GitHub respondió {e.code}.")
        r = {"nueva": False, "mensaje": "No hay versiones publicadas (o el repositorio es privado)."}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        raise ErrorActualizacion("No se ha podido consultar (¿sin conexión?).")
    r["comprobado"] = datetime.datetime.now().isoformat(timespec="seconds")
    cfg = dict(alm.config("actualizaciones") or {}); cfg["ultima"] = r["comprobado"]; cfg["resultado"] = r
    alm.set_config("actualizaciones", cfg)
    return r
