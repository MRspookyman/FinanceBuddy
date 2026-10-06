# Asistente opcional con Jev (TypeSafe AI): un modelo que decide entre opciones y dice con qué confianza.
# La app funciona igual sin él. Si lo activas (Ajustes → Asistente Jev, con tu clave), se usa para:
#   · «Por revisar» del banco: la categoría de lo que tu historial no reconoce (y, si entra dinero, si es un ingreso o
#     te devuelven algo que pagaste) — revisar();
#   · «Por revisar» del bróker: si un texto desconocido es compra, venta, intereses, comisión o un traspaso, y qué tipo
#     de activo es — revisar_broker();
#   · revisar tus categorías ya guardadas: lo que está en «Otros» o donde Jev está muy seguro de que es otra — auditar();
#   · apuntar a mano: la categoría según escribes el concepto — sugerir_categoria();
#   · fijos: si algo que se repite es una cuota fija o un gasto que coincide — fijos();
#   · un extracto de un banco nuevo: si es del banco o del bróker y qué columna es cada cosa — mapear_columnas().
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
import datetime, difflib, json, os, re, threading, urllib.error, urllib.request
from collections import Counter, deque
from concurrent.futures import ThreadPoolExecutor
from . import bizums, clasificar as C, lectura as L

URL = "https://api.typesafe.ai/v1/systemone"
MODELO = "jev-latest"
SEGURA = 0.85      # desde esta confianza, la sugerencia sale marcada al aceptar en bloque
MINIMA = 0.5       # por debajo no se propone nada
MAX_GRUPOS = 80    # por importación (cada grupo es una petición de 70–500 ms)
HILOS = 4

class ErrorJev(Exception):
    pass

PRECIO_MTOK = 0.042  # $ por millón de tokens de entrada (la salida es gratis)
_uso, _uso_lock = {"consultas": 0, "tokens": 0}, threading.Lock()
_enviado = deque(maxlen=30)  # lo último que se ha mandado a Jev (para enseñártelo en Ajustes): lo mismo que sale por la red
def registro(alm):
    """Lo último que se ha enviado a Jev, de más nuevo a más viejo: [{cuando, estado, preguntas:[{nombre, instrucciones, opciones}]}]."""
    return list(reversed(alm.config("jev_enviado") or []))
def guardar_uso(alm):
    """Suma al mes en curso las consultas hechas desde la última vez (config.jev_uso = {AAAA-MM: {consultas, tokens}})
    y guarda lo enviado (config.jev_enviado)."""
    with _uso_lock:
        n, t = _uso["consultas"], _uso["tokens"]; _uso["consultas"] = _uso["tokens"] = 0
        nuevos = list(_enviado); _enviado.clear()
    if nuevos: alm.set_config("jev_enviado", ((alm.config("jev_enviado") or []) + nuevos)[-30:])
    if not n: return
    u = dict(alm.config("jev_uso") or {})
    mes = datetime.date.today().strftime("%Y-%m")
    m = u.get(mes) or {"consultas": 0, "tokens": 0}
    u[mes] = {"consultas": m["consultas"] + n, "tokens": m["tokens"] + t}
    alm.set_config("jev_uso", dict(sorted(u.items())[-12:]))

# ───────────── configuración (la clave vive solo en la base de datos local) ─────────────
_ocultar = []  # palabras de tus titulares (tu nombre): nunca salen, ni en el concepto de una transferencia
def config(alm):
    _ocultar[:] = [w for t in alm.config("titulares") or [] for w in L.norm(t).split() if len(w) >= 3]
    c = alm.config("jev") or {}
    clave = c.get("clave") or os.environ.get("TYPESAFE_API_KEY", "")
    return {"clave": clave, "activo": bool(c.get("activo", True)) and bool(clave), "al_importar": bool(c.get("al_importar", True))}

def config_publica(alm):
    """Lo que ve la página: si hay clave (y sus 4 últimas letras), nunca la clave."""
    c = config(alm)
    uso = (alm.config("jev_uso") or {}).get(datetime.date.today().strftime("%Y-%m")) or {"consultas": 0, "tokens": 0}
    rev = alm.config("jev_revision") or {}
    return {"hay_clave": bool(c["clave"]), "fin_clave": c["clave"][-4:] if c["clave"] else "", "activo": c["activo"], "al_importar": c["al_importar"],
            "de_entorno": bool(c["clave"]) and not (alm.config("jev") or {}).get("clave"),
            "uso": {**uso, "coste": round(uso["tokens"] / 1e6 * PRECIO_MTOK, 6)},
            "revision": {"fecha": rev.get("fecha"), "hallazgos": rev.get("hallazgos") or [], "preguntados": len(rev.get("vistos") or {})}}

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
    with _uso_lock:
        _enviado.append({"cuando": datetime.datetime.now().strftime("%d/%m %H:%M"), "estado": estado,
                         "preguntas": [{"nombre": k, "tipo": q.get("type"), "instrucciones": q.get("instructions"),
                                        "opciones": [str(v)[:70] for v in (q.get("criteria") or {}).values()]} for k, q in preguntas.items()]})
    req = urllib.request.Request(url or os.environ.get("FB_JEV_URL") or URL, data=cuerpo, method="POST",
                                 headers={"Authorization": f"Bearer {clave}", "Content-Type": "application/json"})
    for intento in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.loads(r.read().decode("utf-8"))
            with _uso_lock:
                _uso["consultas"] += 1; _uso["tokens"] += int((d.get("usage") or {}).get("input_tokens") or 0)
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
    guardar_uso(alm)
    return f"Jev responde ({d.get('model', MODELO)}): «Mercadona» → {a.get('choice', '?')} ({round(100 * float(a.get('confidence') or 0))} %)."

def _lote(uno, items):
    """`uno(x)` en paralelo → [(x, resultado, error)]. Si Jev falla (sin conexión, clave, saldo…), no se sigue preguntando
    el resto: esos vuelven con error "" (sin respuesta: se preguntarán la próxima vez)."""
    parar = threading.Event()
    def envuelto(x):
        if parar.is_set(): return x, None, ""
        try: return x, uno(x), None
        except ErrorJev as e: parar.set(); return x, None, str(e)
    with ThreadPoolExecutor(HILOS) as ex: return list(ex.map(envuelto, items))

# ───────────── qué se envía ─────────────
RE_BIZUM = re.compile(r"^\s*bizum\s+(?:(a favor de|a)|de)\s+.*?(?:\bconcepto\b[:\s]*(.*))?$", re.I)
# Transferencia de/a alguien: si no es una empresa o entidad, su nombre no se envía
RE_TRANSF = re.compile(r"^\s*(transferencia(?:\s+inmediata)?(?:\s+recibida|\s+emitida)?)\s+(a favor de|de|a)\s+(.+?)(,?\s*\bconcepto\b.*)?$", re.I)
RE_EMPRESA = re.compile(r"\b(s\.?\s?l\.?u?|s\.?\s?a\.?u?|s\.?\s?coop|sociedad|club|asociaci|fundaci|ayuntamiento|universidad|colegio|comunidad|"
                        r"banco|seguros|tesoreria|agencia|ministerio|servicios|solutions|technologies|group|gmbh|ltd|inc)\b", re.I)
def saneado(texto, importe, donde="una cuenta bancaria en España"):
    """El texto que se manda a Jev: sin nombres de personas en los Bizum, números de tarjeta/cuenta ni correos."""
    t = str(texto or "")
    m = RE_BIZUM.match(t)
    if m:
        concepto = (m.group(2) or "").strip()
        t = f"Bizum {'enviado' if importe < 0 else 'recibido'}" + (f". Concepto: {concepto}" if concepto and not re.fullmatch(r"(?i)sin concepto", concepto) else " sin concepto")
    m = RE_TRANSF.match(t)
    if m and not RE_EMPRESA.search(L.norm(m.group(3))):
        t = f"{m.group(1)} {m.group(2)} una persona{m.group(4) or ''}"
    t = re.sub(r"(?i)\b(?:c/|calle|cl\.?|avda\.?|avenida|plaza|pza\.?|paseo|camino|ctra\.?|carretera)\s*[^\W\d_][\w ºª.-]*?\s*,?\s*\d+\s*[\w.º-]*", "", t)  # direcciones
    for w in _ocultar: t = re.sub(r"(?i)(?<!\w)" + re.escape(w) + r"(?!\w)", "", t)  # tu nombre
    t = re.sub(r"\b[A-Z]{2}\d{2}(?:\s?[\dA-Z]{4}){3,7}\b", "", t)          # IBAN
    t = re.sub(r"\S+@\S+", "", t)                                         # correos
    t = re.sub(r"(?i)tarj\.?\s*:?\s*\*?\d+|\*\d{3,}|\b\d{5,}\b", "", t)   # tarjetas y números largos
    t = re.sub(r"\s{2,}", " ", t).strip(" ,.;:")
    return f"Movimiento de {donde}: «{t}». {'Sale' if importe < 0 else 'Entra'} dinero: {abs(importe):.2f} €."

def _corto(texto, importe):
    """El concepto tal y como se envía (lo de dentro de «»)."""
    return saneado(texto, importe).split("«", 1)[-1].rsplit("»", 1)[0]

# ───────────── contexto: tu historial, para que compare y decida con tu criterio ─────────────
CONTEXTO_BIZUM = {
    False: "Contexto: quien usa la app envía Bizums casi siempre para pagar SU PARTE de algo que pagó otro (cena, copas, regalo, "
           "gasolina, piso…): el concepto suele decir qué era.",
    True: "Contexto: quien usa la app recibe Bizums casi siempre porque ÉL pagó algo (cena, compra, gasolina…) y los demás le devuelven "
          "su parte; a veces el concepto lo dice y a veces no. Solo rara vez es un ingreso suyo."}
RE_PERSONA = re.compile(r"bizum\s+(?:a favor de|enviado a|recibido de|de|a)\s+(.+?)(?:\s+concepto\b.*)?$")

def _concepto_bizum(texto, importe):
    """«Bizum enviado. Concepto: cena» → «cena» (vacío si no tiene)."""
    m = re.search(r"concepto:\s*(.+)$", _corto(texto, importe), re.I)
    return L.norm(m.group(1)).strip() if m else ""

def _persona(texto):
    m = RE_PERSONA.search(L.norm(texto or ""))
    return m.group(1).strip() if m else ""

class Contexto:
    """Lo que se le cuenta a Jev además del movimiento, sacado de TU historial (sin nombres de personas): cómo has clasificado
    cosas parecidas y, en un Bizum, qué suele ser con esa persona. Así compara con tu criterio en vez de adivinar."""
    def __init__(self, alm):
        self.comercios = {}   # (entra, clave del comercio) → [texto de muestra, Counter(categoría)]
        self.conceptos = {True: {}, False: {}}     # Bizums por sentido: concepto → [Counter(categoría)]
        self.personas = {}    # persona (local, nunca se envía) → {"env": Counter(cat), "rec": Counter((clase, cat))}
        for m in alm.todos("movimiento"):
            if m.get("clase") not in ("gasto", "ingreso", "reembolso") or not m.get("categoria"): continue
            t = m.get("ext_texto") or m.get("concepto") or ""
            entra = m["clase"] != "gasto"
            if bizums.es_bizum(t):
                c = _concepto_bizum(t, 1 if entra else -1)
                if c and c not in ("envio de dinero con bizum",): self.conceptos[entra].setdefault(c, Counter())[m["categoria"]] += 1
                p = self.personas.setdefault(_persona(t), {"env": Counter(), "rec": Counter()}) if _persona(t) else None
                if p is not None: (p["rec"] if entra else p["env"])[(m["clase"], m["categoria"]) if entra else m["categoria"]] += 1
            else:
                k = self._clave(t)
                if len(k) >= 3: self.comercios.setdefault((entra, k), [_corto(t, 1 if entra else -1)[:60], Counter()])[1][m["categoria"]] += 1

    @staticmethod
    def _clave(texto):
        """Para emparejar comercios (solo en tu ordenador): la clave de la app, sin «Pago Movil En», «Transferencia de»…"""
        return L.norm(C.comercio(texto) or C.clave(texto))

    @staticmethod
    def _cats(c, n=3):
        return ", ".join(f"{cat} ({v})" if v > 1 else cat for cat, v in c.most_common(n))

    def precedentes(self, texto, importe, incluir_misma=True, n=4):
        """Comercios parecidos que ya has clasificado y cómo."""
        entra = importe > 0
        k = self._clave(texto)
        claves = [x for (e, x) in self.comercios if e == entra and (incluir_misma or x != k)]
        parecidos = difflib.get_close_matches(k, claves, n=n, cutoff=0.55) if not bizums.es_bizum(texto) else []
        if incluir_misma and k in claves and k not in parecidos: parecidos.insert(0, k)
        lineas = [f"«{self.comercios[(entra, x)][0]}» → {self._cats(self.comercios[(entra, x)][1])}" for x in parecidos[:n]]
        return ("Cómo has clasificado cosas parecidas: " + "; ".join(lineas) + ".") if lineas else ""

    def habituales(self, entra, n=8):
        """Tus Bizums enviados (o recibidos) más repetidos, por concepto, y cómo los has clasificado."""
        top = sorted(self.conceptos[entra].items(), key=lambda kv: -sum(kv[1].values()))[:n]
        if not top: return ""
        return f"Tus Bizums {'recibidos' if entra else 'enviados'} más habituales, por concepto: " + "; ".join(
            f"«{c}» → {self._cats(v, 2)}" for c, v in top) + "."

    def persona(self, texto):
        """Qué ha pasado antes con esa persona (el nombre no sale de tu ordenador)."""
        p = self.personas.get(_persona(texto))
        if not p: return ""
        env, rec = sum(p["env"].values()), sum(p["rec"].values())
        partes = []
        if env: partes.append(f"le has enviado {env} Bizum{'s' if env > 1 else ''} (de {self._cats(p['env'])})")
        if rec:
            reem, ing = Counter(), 0
            for (clase, cat), v in p["rec"].items():
                if clase == "reembolso": reem[cat] += v
                else: ing += v
            q = ([f"{sum(reem.values())} te devolvían {self._cats(reem)}"] if reem else []) + ([f"{ing} eran ingresos"] if ing else [])
            partes.append(f"te ha enviado {rec} ({', '.join(q)})")
        return ("Con esa misma persona, antes: " + " y ".join(partes) + ".") if partes else ""

    def de(self, texto, importe, incluir_misma=True, persona=True):
        """El texto de contexto para una consulta sobre este movimiento (vacío si no hay nada que contar)."""
        if bizums.es_bizum(texto):
            e = importe > 0
            return "\n".join(x for x in (CONTEXTO_BIZUM[e], self.habituales(e), self.persona(texto) if persona else "") if x)
        return self.precedentes(texto, importe, incluir_misma)

def _con_contexto(estado, contexto):
    return estado + ("\n" + contexto if contexto else "")

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
    cats = [c for c in alm.todos("categoria") if not c.get("oculta")]  # las ocultas no se proponen
    gasto = [(c["nombre"], c.get("descripcion") or DESCRIPCIONES.get(c["nombre"], "")) for c in cats if c.get("grupo") != "ingreso"]
    ingreso = [(c["nombre"], c.get("descripcion") or DESCRIPCIONES.get(c["nombre"], "")) for c in cats if c.get("grupo") == "ingreso"]
    return gasto, ingreso

def clasificar(clave, texto, importe, gasto, ingreso, url=None, minima=MINIMA, contexto=""):
    """→ {clase: gasto|ingreso|reembolso, categoria, confianza, modelo} o None si Jev no está seguro.
    `contexto`: lo que se le cuenta de tu historial (Contexto.de)."""
    cg, ng = _opciones(gasto)
    estado = _con_contexto(saneado(texto, importe), contexto)
    if importe < 0:
        ans, d = preguntar(clave, estado, {"categoria": {"type": "choice", "instructions": "¿En qué categoría de gasto encaja este pago?", "criteria": cg}}, url=url)
        a = ans.get("categoria") or {}
        r = {"clase": "gasto", "categoria": ng.get(a.get("choice")), "confianza": float(a.get("confidence") or 0)}
    else:
        ci, ni = _opciones(ingreso)
        ans, d = preguntar(clave, estado, {
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
    pend = alm.todos("pendiente")
    rep = bizums.repartos(pend)  # varios Bizums iguales el mismo día: un solo reparto, se pregunta una vez
    grupos = {}
    for p in pend:
        f = p.get("fila") or {}
        if p.get("tipo_import") != "banco" or f.get("clase") == "transferencia" or p.get("jev"): continue
        s = C.sugerir(f.get("texto", ""), f.get("importe", 0), mem, f.get("cat", ""))
        # En un Bizum, «como las otras veces con esa persona» es una pista floja (decide el concepto): se pregunta igual
        if s and not str(s.get("motivo", "")).startswith("parecido") and not bizums.es_bizum(f.get("texto")): continue
        k = (p.get("cuenta"), rep[p["id"]], False) if p["id"] in rep else (p.get("cuenta"), f.get("patron") or C.patron_sugerido(f.get("texto", "")), f.get("importe", 0) < 0)
        grupos.setdefault(k, []).append(p)
    return list(grupos.values())

def clasificar_reparto(alm, clave, g, gasto, ingreso, ctx, url=None):
    """Un reparto de Bizums recibidos: Jev compara el importe con los gastos tuyos de los días anteriores y dice de cuál es la
    parte (o que de ninguno). → {clase: reembolso, categoria, confianza, modelo, motivo} o None."""
    f = g[0]["fila"]
    imp = f["importe"]
    fijas = {c["nombre"] for c in alm.todos("categoria") if c.get("grupo") == "fijo"}
    gastos = [bizums._gasto(m) for m in alm.todos("movimiento") if m.get("clase") == "gasto"]
    recibidos = [{"fecha": p["fila"]["op"], "importe": p["fila"]["importe"]} for p in alm.todos("pendiente") if p["fila"].get("importe", 0) > 0 and bizums.es_bizum(p["fila"].get("texto"))]
    cs = bizums.candidatos(imp, f["op"], gastos, recibidos, fijas, maximo=6)
    if not cs: return None
    d0 = datetime.date.fromisoformat(f["op"])
    crit, por = {}, {}
    for i, c in enumerate(cs):
        gst = c["gasto"]
        cuando = "ese mismo día" if c["dias"] == 0 else f"{c['dias']} día{'s' if c['dias'] > 1 else ''} antes"
        cuenta = f" · {imp:.2f} € es la parte {c['k']}ª (tú incluido)" if c.get("k") and c["k"] > 1 else (f" · {imp:.2f} € es justo ese gasto entero" if c.get("k") == 1 else "")
        crit[f"g{i}"] = f"{cuando}, pagaste {gst['importe']:.2f} € en «{_corto(gst['texto'], -1)[:50]}» ({gst['cat']}){cuenta}"
        por[f"g{i}"] = c
    crit["ninguno"] = "No devuelve ninguno de estos gastos: es un ingreso suyo, o un gasto que pagaste en efectivo o desde otra cuenta"
    n = len(g)
    estado = _con_contexto(saneado(f.get("texto", ""), imp) + (f" Ese día te han enviado {n} Bizums de esa misma cantidad." if n > 1 else ""),
                           ctx.de(f.get("texto", ""), imp, persona=n == 1))
    ans, d = preguntar(clave, estado, {"origen": {"type": "choice", "instructions": "¿De cuál de tus gastos es esta parte que te devuelven?", "criteria": crit}}, url=url)
    a = ans.get("origen") or {}
    c, conf = por.get(a.get("choice")), float(a.get("confidence") or 0)
    if not c or conf < MINIMA: return None
    return {"clase": "reembolso", "categoria": c["gasto"]["cat"], "confianza": round(conf, 3), "modelo": d.get("model", MODELO),
            "motivo": f"parte de «{_corto(c['gasto']['texto'], -1)[:30]}»", "gasto_id": c["gasto"]["id"]}

def revisar(alm, limite=MAX_GRUPOS, url=None):
    """Pide a Jev la categoría de los grupos de «Por revisar» sin sugerencia y la guarda en cada duda (`jev`).
    → (grupos con sugerencia nueva, grupos preguntados, error o None)."""
    c = config(alm)
    if not c["activo"]: return 0, 0, None
    gasto, ingreso = categorias_de(alm)
    grupos = grupos_sin_sugerencia(alm)[:limite]
    if not grupos: return 0, 0, None
    ctx = Contexto(alm)
    def uno(g):
        f = g[0]["fila"]
        if f.get("importe", 0) > 0 and bizums.es_bizum(f.get("texto")):  # Bizum recibido: primero, ¿de qué gasto tuyo es?
            r = clasificar_reparto(alm, c["clave"], g, gasto, ingreso, ctx, url=url)
            if r: return r
        return clasificar(c["clave"], f.get("texto", ""), f.get("importe", 0), gasto, ingreso, url=url,
                          contexto=ctx.de(f.get("texto", ""), f.get("importe", 0), persona=len(g) == 1))
    res = _lote(uno, grupos)
    n, error = 0, None
    with alm.transaccion():
        for g, r, err in res:
            if err is not None:  # sin respuesta (red, clave…): se volverá a preguntar la próxima vez
                error = error or err or None; continue
            for p in g:
                actual = alm.obtener("pendiente", p["id"])
                if not actual: continue
                alm.guardar("pendiente", {**actual, "jev": r or {"sin_decision": True}}, p["id"])
            if r: n += 1
    guardar_uso(alm)
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
    preguntas["_tipo"] = {"type": "choice", "instructions": "¿De qué es este archivo?", "criteria": {
        "banco": "Movimientos de una cuenta bancaria: compras, recibos, nómina, Bizum, transferencias",
        "inversion": "Movimientos de la cuenta de efectivo de un bróker: compras y ventas de fondos, ETF o acciones, intereses, traspasos"}}
    try: ans, _ = preguntar(c["clave"], estado, preguntas, url=url)
    except ErrorJev: return {}
    finally: guardar_uso(alm)
    out = {}
    t = ans.get("_tipo") or {}
    if t.get("choice") in ("banco", "inversion") and float(t.get("confidence") or 0) >= 0.7: out["_tipo"] = t["choice"]
    for k in CAMPOS:
        a = ans.get(k) or {}
        ch = a.get("choice")
        if ch and ch != "ninguna" and float(a.get("confidence") or 0) >= 0.6: out[k] = cols[int(ch[1:])]
    return out

# ───────────── elegir una categoría ─────────────
def _elegir(clave, estado, instrucciones, categorias, url=None):
    """Una pregunta «choice» sobre una lista de categorías [(nombre, descripción)] → (nombre, confianza)."""
    crit, nombres = _opciones(categorias)
    ans, _ = preguntar(clave, estado, {"cat": {"type": "choice", "instructions": instrucciones, "criteria": crit}}, url=url)
    a = ans.get("cat") or {}
    return nombres.get(a.get("choice")), float(a.get("confidence") or 0)

# ───────────── apuntar a mano: la categoría según escribes el concepto ─────────────
def sugerir_categoria(alm, texto, importe, url=None):
    """Tus reglas, luego tu historial y, si nada lo reconoce, Jev. → {categoria, clase, fuente, confianza?} o {}."""
    texto = str(texto or "").strip()
    if len(texto) < 3: return {}
    entra = importe > 0
    regla = C.regla_para(texto, C.ordenar_reglas(alm.todos("regla")))
    if regla and regla.get("categoria") and regla.get("clase") in (("ingreso", "reembolso") if entra else ("gasto",)):
        return {"categoria": regla["categoria"], "clase": regla["clase"], "fuente": "regla"}
    s = C.sugerir(texto, importe, C.memoria([{**m, "ext_texto": m.get("ext_texto") or m.get("concepto")} for m in alm.todos("movimiento")]))  # también lo apuntado a mano
    if s and not str(s.get("motivo", "")).startswith("parecido"):
        return {"categoria": s["categoria"], "clase": s["clase"], "fuente": "historial"}
    c = config(alm)
    if not c["activo"]: return {"categoria": s["categoria"], "clase": s["clase"], "fuente": "historial"} if s else {}
    gasto, ingreso = categorias_de(alm)
    try:
        cat, conf = _elegir(c["clave"], _con_contexto(f"Movimiento apuntado a mano: «{texto}». {'Entra' if entra else 'Sale'} dinero: {abs(importe):.2f} €.",
                                                       Contexto(alm).de(texto, importe)),
                            "¿En qué categoría encaja?", ingreso if entra else gasto, url=url)
    except ErrorJev: return {}
    finally: guardar_uso(alm)
    return {"categoria": cat, "clase": "ingreso" if entra else "gasto", "fuente": "jev", "confianza": round(conf, 3)} if cat and conf >= MINIMA else {}

# ───────────── «Por revisar» del bróker ─────────────
ACCIONES_BROKER = {
    "compra": "Compra de un fondo, ETF, acción o criptomoneda", "venta": "Venta o reembolso de un fondo, ETF, acción o criptomoneda",
    "intereses": "Intereses o remuneración del dinero sin invertir", "dividendo": "Dividendos cobrados",
    "comision": "Comisión, custodia u otro gasto del bróker", "traspaso": "Dinero que pasas entre tu banco y el bróker (ingreso o retirada)"}
CLASES_ACTIVO = {"fondo": "Fondo de inversión (indexado o no)", "etf": "ETF o ETC cotizado", "accion": "Acción de una empresa",
                 "cripto": "Criptomoneda o producto que la replica", "materia": "Oro, plata, cobre u otras materias primas", "otro": "Otro producto"}
def revisar_broker(alm, limite=MAX_GRUPOS, url=None):
    """Dudas del bróker cuyo texto la app no reconoce (propondría crear un activo con ese nombre): Jev dice si es una
    compra, venta, intereses, comisión o traspaso, y qué tipo de activo. Se guarda en la duda (`jev`). → nº de grupos."""
    from .importar import sugerencia_inversion
    c = config(alm)
    if not c["activo"]: return 0
    activos = alm.todos("activo")
    grupos = {}
    for p in alm.todos("pendiente"):
        if p.get("tipo_import") != "inversion" or p.get("jev"): continue
        s = sugerencia_inversion(p, activos) or {}
        if not s.get("nuevo") or s.get("isin"): continue  # lo reconoce la app (o es un fondo del catálogo)
        f = p["fila"]
        grupos.setdefault((p.get("cuenta"), C.patron_sugerido(f.get("texto", "")), f.get("importe", 0) < 0), []).append(p)
    grupos = list(grupos.values())[:limite]
    def uno(g):
        f = g[0]["fila"]
        ans, d = preguntar(c["clave"], saneado(f.get("texto", ""), f.get("importe", 0), "la cuenta de efectivo de un bróker de inversión en España"), {
            "accion": {"type": "choice", "instructions": "¿Qué es este movimiento?", "criteria": ACCIONES_BROKER},
            "clase": {"type": "choice", "instructions": "Si es una compra o venta, ¿de qué tipo de producto?", "criteria": CLASES_ACTIVO}}, url=url)
        a, k = ans.get("accion") or {}, ans.get("clase") or {}
        return {"accion": a.get("choice"), "confianza": round(float(a.get("confidence") or 0), 3), "clase": k.get("choice"),
                "confianza_clase": round(float(k.get("confidence") or 0), 3), "modelo": d.get("model", MODELO)}
    res = _lote(uno, grupos)
    n = 0
    with alm.transaccion():
        for g, r, _ in res:
            if not r: continue
            n += 1
            for p in g:
                actual = alm.obtener("pendiente", p["id"])
                if actual: alm.guardar("pendiente", {**actual, "jev": r}, p["id"])
    guardar_uso(alm)
    return n

def sugerencia_broker(s, j):
    """Mezcla la sugerencia de la app para una duda del bróker (`s`) con lo que dijo Jev (`j`), si la app no la reconocía."""
    if not j or not j.get("accion") or not (s or {}).get("nuevo"): return s
    conf, pct = float(j.get("confianza") or 0), f"Jev · {round(100 * float(j.get('confianza') or 0))} %"
    if conf >= 0.7 and j["accion"] == "traspaso": return {"accion": "ignorar", "fuente": "jev", "motivo": pct, "confianza": conf}
    if conf >= 0.7 and j["accion"] in ("intereses", "dividendo", "comision"): return {"accion": "interes", "fuente": "jev", "motivo": pct, "confianza": conf}
    k = float(j.get("confianza_clase") or 0)
    if j["accion"] in ("compra", "venta") and s.get("clase") == "otro" and j.get("clase") in CLASES_ACTIVO and k >= 0.6:
        return {**s, "clase": j["clase"], "fuente": "jev", "motivo": f"Jev · {round(100 * k)} %", "confianza": k}
    return s

# ───────────── revisar tus categorías ya guardadas ─────────────
OTROS = ("Otros", "Otros ingresos")
def auditar(alm, limite=150, url=None):
    """Repasa lo que ya tienes clasificado, un comercio cada vez (mismo patrón y tipo): si está en «Otros» y Jev ve
    otra categoría, o si Jev está muy seguro (≥ 85 %) de que es otra, lo apunta como hallazgo para que decidas.
    Lo ya preguntado (con la misma categoría) no se repite. → (preguntados ahora, hallazgos pendientes, error o None)."""
    c = config(alm)
    if not c["activo"]: return 0, 0, None
    from collections import Counter
    gasto, ingreso = categorias_de(alm)
    ctx = Contexto(alm)
    rev = dict(alm.config("jev_revision") or {})
    vistos, hallazgos = dict(rev.get("vistos") or {}), {h["clave"]: h for h in rev.get("hallazgos") or []}
    grupos = {}
    for m in alm.todos("movimiento"):
        if m.get("clase") not in ("gasto", "ingreso", "reembolso") or not m.get("categoria"): continue
        texto = m.get("ext_texto") or m.get("concepto") or ""
        pat = C.patron_sugerido(texto)
        if not pat: continue
        grupos.setdefault(f"{'i' if m['clase'] == 'ingreso' else 'g'}|{pat}", []).append(m)
    pendientes = []
    for k, ms in grupos.items():
        cat = Counter(m["categoria"] for m in ms).most_common(1)[0][0]
        if (vistos.get(k) or {}).get("cat") == cat: continue
        pendientes.append((k, ms, cat))
    pendientes = sorted(pendientes, key=lambda x: -len(x[1]))[:limite]
    def uno(x):
        k, ms, cat = x
        m = ms[-1]
        entra = m["clase"] == "ingreso"
        imp = float(m.get("ext_importe") or (m["importe"] if m["clase"] != "gasto" else -m["importe"]))
        t = m.get("ext_texto") or m.get("concepto")
        # Sin su propio historial (si no, solo repetiría lo que ya hay): comparte lo demás, pero no la misma ficha ni a la misma persona
        return _elegir(c["clave"], _con_contexto(saneado(t, imp), ctx.de(t, imp, incluir_misma=False, persona=False)),
                       "¿De qué tipo de ingreso es?" if entra else "¿En qué categoría de gasto encaja?", ingreso if entra else gasto, url=url)
    res = _lote(uno, pendientes)
    n, error = 0, None
    for (k, ms, cat), r, err in res:
        if err is not None: error = error or err or None; continue
        j, conf = r
        if j is None: continue
        n += 1
        vistos[k] = {"cat": cat, "jev": j, "conf": round(conf, 3)}
        hallazgos.pop(k, None)
        if j != cat and ((cat in OTROS and j not in OTROS and conf >= MINIMA) or conf >= SEGURA):
            m = ms[-1]
            nombre = Counter(x.get("concepto") or "" for x in ms).most_common(1)[0][0].strip()
            hallazgos[k] = {"clave": k, "id": m["id"], "nombre": nombre if 2 < len(nombre) <= 40 else C.titulo(k.split("|", 1)[1]), "n": len(ms),
                            "total": round(sum(float(x["importe"]) for x in ms), 2), "actual": cat, "propuesta": j, "confianza": round(conf, 3),
                            "ingreso": m["clase"] == "ingreso", "ejemplo": saneado(m.get("ext_texto") or m.get("concepto"), -1 if m["clase"] == "gasto" else 1).split("«", 1)[-1].split("»")[0]}
    if error and not n: guardar_uso(alm); return 0, len(hallazgos), error  # sin respuesta: nada cambia
    alm.set_config("jev_revision", {"fecha": datetime.date.today().isoformat(), "vistos": vistos,
                                    "hallazgos": sorted(hallazgos.values(), key=lambda h: (h["actual"] not in OTROS, -h["confianza"]))})
    guardar_uso(alm)
    return n, len(hallazgos), None

def resolver_hallazgo(alm, clave, accion):
    """aplicar: la categoría que propone Jev para todo ese comercio (y la recuerda como regla) · descartar: está bien así."""
    from .importar import recategorizar
    rev = dict(alm.config("jev_revision") or {})
    h = next((x for x in rev.get("hallazgos") or [] if x["clave"] == clave), None)
    if not h: raise ValueError("Eso ya está revisado.")
    msg = "Vale, se queda como está"
    if accion == "aplicar":
        if not alm.obtener("movimiento", int(h["id"])): raise ValueError("Ese movimiento ya no existe.")
        msg = recategorizar(alm, int(h["id"]), {"categoria": h["propuesta"], "parecidos": True, "recordar": True})
        (rev.setdefault("vistos", {}))[clave] = {"cat": h["propuesta"], "jev": h["propuesta"], "conf": h["confianza"]}
    rev["hallazgos"] = [x for x in rev.get("hallazgos") or [] if x["clave"] != clave]
    alm.set_config("jev_revision", rev)
    return msg

# ───────────── fijos: ¿cuota fija o gasto que coincide? ─────────────
def fijos(alm, lista, url=None):
    """Para lo que se repite cada mes en una categoría de gasto variable (p. ej. una academia en «Formación»), Jev dice
    si parece una cuota fija. Añade `jev_fijo` (0–1) a cada uno. Se recuerda por nombre e importe."""
    c = config(alm)
    if not c["activo"]: return lista
    cache = dict(alm.config("jev_fijos") or {})
    candidatos = [f for f in lista if f.get("grupo") == "variable" and f.get("clase") != "ingreso"]
    clave = lambda f: f"{f.get('ejemplo') or f.get('nombre')}|{round(float(f.get('importe') or 0))}"
    faltan = [f for f in candidatos if clave(f) not in cache]
    def uno(f):
        estado = saneado(f.get("ejemplo") or f.get("nombre"), -float(f.get("importe") or 0)) + \
                 f" Se ha repetido {f.get('meses')} meses seguidos: {', '.join(f'{x:.2f} €' for x in (f.get('importes') or []))}."
        ans, _ = preguntar(c["clave"], estado, {"fijo": {"type": "noul", "instructions":
            "¿Es una cuota o recibo que se paga cada mes (suscripción, cuota, clases, alquiler) y no un gasto que simplemente coincide?"}}, url=url)
        return float((ans.get("fijo") or {}).get("noul") or 0)
    if faltan:
        for f, p, _ in _lote(uno, faltan):
            if p is not None: cache[clave(f)] = round(p, 3)
        alm.set_config("jev_fijos", dict(list(cache.items())[-300:]))
        guardar_uso(alm)
    for f in candidatos:
        if clave(f) in cache: f["jev_fijo"] = cache[clave(f)]
    return lista
