# Asistente opcional con Jev (TypeSafe AI): un modelo que decide entre opciones y dice con qué confianza.
# La app funciona igual sin él. Si lo activas (Ajustes → Asistente Jev, con tu clave), se usa para:
#   · proponer la categoría de lo que queda en «Por revisar» sin sugerencia (y, si entra dinero, si es un ingreso o
#     te devuelven algo que pagaste);
#   · proponer qué columna es cada cosa en el extracto de un banco que la app aún no conoce.
# Nunca guarda nada por su cuenta: solo sugiere, y lo que aceptas se convierte en regla como siempre.
#
# Qué se envía: el concepto del movimiento, saneado (sin nombres de los Bizum, números de tarjeta, IBAN ni correos),
# si entra o sale dinero y el importe. Nada de saldos, cuentas ni fechas. La clave se guarda solo en tu carpeta de datos.
#
# API (documentada): POST https://api.typesafe.ai/v1/systemone · Authorization: Bearer <clave>
#   {"model": "jev-latest", "state": "<contexto>", "questions": {"<nombre>": {"type": "choice", "instructions": "…",
#    "criteria": {"<opción>": "<descripción>"}}}}
#   → {"model": "jev-1.13.0", "answers": {"<nombre>": {"type": "choice", "choice": "<opción>", "confidence": 0.93,
#      "probabilities": {…}}}, "usage": {"input_tokens": …, "output_tokens": …}}
import json, os, re, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from . import clasificar as C, lectura as L

URL = "https://api.typesafe.ai/v1/systemone"
MODELO = "jev-latest"
SEGURA = 0.85      # desde esta confianza, la sugerencia sale marcada al aceptar en bloque
MINIMA = 0.5       # por debajo no se propone nada
MAX_GRUPOS = 80    # por importación (cada grupo es una petición de 70–500 ms)
HILOS = 4

class ErrorJev(Exception):
    pass

# ───────────── configuración (la clave vive solo en la base de datos local) ─────────────
def config(alm):
    c = alm.config("jev") or {}
    clave = c.get("clave") or os.environ.get("TYPESAFE_API_KEY", "")
    return {"clave": clave, "activo": bool(c.get("activo", True)) and bool(clave), "al_importar": bool(c.get("al_importar", True))}

def config_publica(alm):
    """Lo que ve la página: si hay clave (y sus 4 últimas letras), nunca la clave."""
    c = config(alm)
    return {"hay_clave": bool(c["clave"]), "fin_clave": c["clave"][-4:] if c["clave"] else "", "activo": c["activo"], "al_importar": c["al_importar"],
            "de_entorno": bool(c["clave"]) and not (alm.config("jev") or {}).get("clave")}

def guardar_config(alm, d):
    c = dict(alm.config("jev") or {})
    if "clave" in d:
        clave = str(d.get("clave") or "").strip()
        if clave and not re.fullmatch(r"[A-Za-z0-9_\-\.]{16,300}", clave): raise ValueError("Esa clave no parece válida (cópiala entera desde TypeSafe).")
        c["clave"] = clave
    for k in ("activo", "al_importar"):
        if k in d: c[k] = bool(d[k])
    alm.set_config("jev", c)

# ───────────── llamada ─────────────
def preguntar(clave, estado, preguntas, timeout=15, url=None):
    """Una petición a /v1/systemone → {nombre: respuesta}. Lanza ErrorJev con un mensaje legible."""
    cuerpo = json.dumps({"model": MODELO, "state": estado, "questions": preguntas}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url or os.environ.get("FB_JEV_URL") or URL, data=cuerpo, method="POST",
                                 headers={"Authorization": f"Bearer {clave}", "Content-Type": "application/json"})
    for intento in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.loads(r.read().decode("utf-8"))
            return d.get("answers") or {}, d
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and intento == 1: continue
            detalle = ""
            try: detalle = json.loads(e.read().decode("utf-8")).get("error", {}).get("message", "")
            except Exception: pass
            raise ErrorJev({401: "La clave de Jev no es válida o ha caducado.", 402: "Tu cuenta de Jev no tiene saldo.",
                            403: "Tu clave de Jev no tiene permiso para esto.", 429: "Jev está recibiendo demasiadas peticiones: prueba en un rato."}
                           .get(e.code, f"Jev ha respondido con un error ({e.code}){': ' + detalle if detalle else ''}."))
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if intento == 1: continue
            raise ErrorJev(f"No se puede conectar con Jev ({getattr(e, 'reason', e)}). ¿Hay conexión a internet?")
        except ValueError:
            raise ErrorJev("Jev ha devuelto una respuesta que no se entiende.")

def probar(alm):
    c = config(alm)
    if not c["clave"]: raise ErrorJev("Primero pega tu clave de Jev.")
    ans, d = preguntar(c["clave"], "Pago con tarjeta en Mercadona. Sale dinero: 45,20 €.",
                       {"categoria": {"type": "choice", "instructions": "¿Qué tipo de gasto es?",
                                      "criteria": {"supermercado": "comida y productos de casa", "ocio": "cine, conciertos, salir"}}})
    a = ans.get("categoria") or {}
    return f"Jev responde ({d.get('model', MODELO)}): «Mercadona» → {a.get('choice', '?')} ({round(100 * float(a.get('confidence') or 0))} %)."

# ───────────── qué se envía ─────────────
RE_BIZUM = re.compile(r"^\s*bizum\s+(?:(a favor de|a)|de)\s+.*?(?:\bconcepto\b[:\s]*(.*))?$", re.I)
# Transferencia de/a alguien: si no es una empresa o entidad, su nombre no se envía
RE_TRANSF = re.compile(r"^\s*(transferencia(?:\s+inmediata)?(?:\s+recibida|\s+emitida)?)\s+(a favor de|de|a)\s+(.+?)(,?\s*\bconcepto\b.*)?$", re.I)
RE_EMPRESA = re.compile(r"\b(s\.?\s?l\.?u?|s\.?\s?a\.?u?|s\.?\s?coop|sociedad|club|asociaci|fundaci|ayuntamiento|universidad|colegio|comunidad|"
                        r"banco|seguros|tesoreria|agencia|ministerio|servicios|solutions|technologies|group|gmbh|ltd|inc)\b", re.I)
def saneado(texto, importe):
    """El texto que se manda a Jev: sin nombres de personas en los Bizum, números de tarjeta/cuenta ni correos."""
    t = str(texto or "")
    m = RE_BIZUM.match(t)
    if m:
        concepto = (m.group(2) or "").strip()
        t = f"Bizum {'enviado' if importe < 0 else 'recibido'}" + (f". Concepto: {concepto}" if concepto and not re.fullmatch(r"(?i)sin concepto", concepto) else " sin concepto")
    m = RE_TRANSF.match(t)
    if m and not RE_EMPRESA.search(L.norm(m.group(3))):
        t = f"{m.group(1)} {m.group(2)} una persona{m.group(4) or ''}"
    t = re.sub(r"\b[A-Z]{2}\d{2}(?:\s?[\dA-Z]{4}){3,7}\b", "", t)          # IBAN
    t = re.sub(r"\S+@\S+", "", t)                                         # correos
    t = re.sub(r"(?i)tarj\.?\s*:?\s*\*?\d+|\*\d{3,}|\b\d{5,}\b", "", t)   # tarjetas y números largos
    t = re.sub(r"\s{2,}", " ", t).strip(" ,.;:")
    return f"Movimiento de una cuenta bancaria en España: «{t}». {'Sale' if importe < 0 else 'Entra'} dinero: {abs(importe):.2f} €."

def _slug(s):
    return re.sub(r"[^a-z0-9]+", "_", L.norm(s)).strip("_")[:40] or "x"

def _opciones(categorias):
    """{slug: descripción} y {slug: nombre} para una lista de categorías [(nombre, descripción)]."""
    crit, nombres = {}, {}
    for n, desc in categorias:
        k = _slug(n)
        while k in crit: k += "_"
        crit[k] = f"{n}: {desc}" if desc else n
        nombres[k] = n
    return crit, nombres

def categorias_de(alm):
    from .plantilla import DESCRIPCIONES
    cats = alm.todos("categoria")
    gasto = [(c["nombre"], c.get("descripcion") or DESCRIPCIONES.get(c["nombre"], "")) for c in cats if c.get("grupo") != "ingreso"]
    ingreso = [(c["nombre"], c.get("descripcion") or DESCRIPCIONES.get(c["nombre"], "")) for c in cats if c.get("grupo") == "ingreso"]
    return gasto, ingreso

def clasificar(clave, texto, importe, gasto, ingreso, url=None, minima=MINIMA):
    """→ {clase: gasto|ingreso|reembolso, categoria, confianza, modelo} o None si Jev no está seguro."""
    cg, ng = _opciones(gasto)
    if importe < 0:
        ans, d = preguntar(clave, saneado(texto, importe), {"categoria": {"type": "choice", "instructions": "¿En qué categoría de gasto encaja este pago?", "criteria": cg}}, url=url)
        a = ans.get("categoria") or {}
        r = {"clase": "gasto", "categoria": ng.get(a.get("choice")), "confianza": float(a.get("confidence") or 0)}
    else:
        ci, ni = _opciones(ingreso)
        ans, d = preguntar(clave, saneado(texto, importe), {
            "tipo": {"type": "choice", "instructions": "¿Por qué entra este dinero?", "criteria": {
                "reembolso": "Te devuelven dinero de algo que pagaste tú: un amigo te paga su parte de una cena o un regalo, una tienda te devuelve una compra",
                "ingreso": "Dinero que ganas: nómina, pensión, alquiler que cobras, venta de algo, premio, intereses"}},
            "gasto": {"type": "choice", "instructions": "Si te devuelven dinero, ¿de qué tipo de gasto era?", "criteria": cg},
            "ingreso": {"type": "choice", "instructions": "Si es un ingreso, ¿de qué tipo?", "criteria": ci}}, url=url)
        t = ans.get("tipo") or {}
        cual = "gasto" if t.get("choice") == "reembolso" else "ingreso"
        a = ans.get(cual) or {}
        r = {"clase": "reembolso" if cual == "gasto" else "ingreso", "categoria": (ng if cual == "gasto" else ni).get(a.get("choice")),
             "confianza": float(t.get("confidence") or 0) * float(a.get("confidence") or 0)}
    if not r["categoria"] or r["confianza"] < minima: return None
    return {**r, "confianza": round(r["confianza"], 3), "modelo": d.get("model", MODELO), "tokens": (d.get("usage") or {}).get("input_tokens", 0)}

# ───────────── «Por revisar» ─────────────
def grupos_sin_sugerencia(alm):
    """Grupos de dudas del banco (misma cuenta, comercio y signo) sin sugerencia de tu historial ni de Jev."""
    movs = alm.todos("movimiento")
    mem = C.memoria(movs)
    grupos = {}
    for p in alm.todos("pendiente"):
        f = p.get("fila") or {}
        if p.get("tipo_import") != "banco" or f.get("clase") == "transferencia" or p.get("jev"): continue
        s = C.sugerir(f.get("texto", ""), f.get("importe", 0), mem, f.get("cat", ""))
        if s and not str(s.get("motivo", "")).startswith("parecido"): continue
        k = (p.get("cuenta"), f.get("patron") or C.patron_sugerido(f.get("texto", "")), f.get("importe", 0) < 0)
        grupos.setdefault(k, []).append(p)
    return list(grupos.values())

def revisar(alm, limite=MAX_GRUPOS, url=None):
    """Pide a Jev la categoría de los grupos de «Por revisar» sin sugerencia y la guarda en cada duda (`jev`).
    → (grupos con sugerencia nueva, grupos preguntados, error o None)."""
    c = config(alm)
    if not c["activo"]: return 0, 0, None
    gasto, ingreso = categorias_de(alm)
    grupos = grupos_sin_sugerencia(alm)[:limite]
    if not grupos: return 0, 0, None
    def uno(g):
        f = g[0]["fila"]
        try: return g, clasificar(c["clave"], f.get("texto", ""), f.get("importe", 0), gasto, ingreso, url=url), None
        except ErrorJev as e: return g, None, str(e)
    with ThreadPoolExecutor(HILOS) as ex: res = list(ex.map(uno, grupos))
    n, error = 0, None
    with alm.transaccion():
        for g, r, err in res:
            error = error or err
            if err: continue  # sin respuesta (red, clave…): se volverá a preguntar la próxima vez
            for p in g:
                actual = alm.obtener("pendiente", p["id"])
                if not actual: continue
                alm.guardar("pendiente", {**actual, "jev": r or {"sin_decision": True}}, p["id"])
            if r: n += 1
    if error and not n: return 0, len(grupos), error
    return n, len(grupos), None

# ───────────── formato de archivo nuevo ─────────────
CAMPOS = {"fecha": "La fecha de la operación (no la fecha valor)", "concepto": "El texto que describe el movimiento",
          "importe": "El importe con signo (negativo si sale dinero)", "cargo": "Solo las salidas de dinero (cargos, debe)",
          "abono": "Solo las entradas de dinero (abonos, haber)", "saldo": "El saldo de la cuenta después de cada movimiento",
          "fecha_valor": "La fecha valor"}
def mapear_columnas(alm, cabecera, ejemplos, url=None):
    """Para un extracto nuevo: {campo: texto de la cabecera, …} que Jev da como más probable (con confianza ≥ 0,6)."""
    c = config(alm)
    if not c["activo"]: return {}
    cols = [x for x in cabecera if str(x or "").strip()]
    if len(cols) < 2: return {}
    crit = {f"c{i}": f"{col} (p. ej.: {', '.join(str(f[cabecera.index(col)]) for f in ejemplos[:3] if cabecera.index(col) < len(f))})" for i, col in enumerate(cols)}
    crit["ninguna"] = "Ninguna columna es esto"
    estado = "Extracto bancario (Excel o CSV) de un banco español. Columnas y ejemplos:\n" + "\n".join(
        " | ".join(str(x) for x in fila) for fila in [cabecera] + [list(f) for f in ejemplos[:4]])
    preguntas = {k: {"type": "choice", "instructions": f"¿Qué columna es: {desc}?", "criteria": crit} for k, desc in CAMPOS.items()}
    try: ans, _ = preguntar(c["clave"], estado, preguntas, url=url)
    except ErrorJev: return {}
    out = {}
    for k in CAMPOS:
        a = ans.get(k) or {}
        ch = a.get("choice")
        if ch and ch != "ninguna" and float(a.get("confidence") or 0) >= 0.6: out[k] = cols[int(ch[1:])]
    return out
