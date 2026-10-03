# Precios por internet (OPCIONAL, apagado de serie): en vez de apuntar a mano lo que vale cada fondo, ETF o cripto, la app lo
# consulta a Yahoo Finance, Morningstar o CoinGecko. Es lo único (junto con Jev) que sale de tu ordenador, y solo sale el
# IDENTIFICADOR del producto (ISIN, ticker o nombre de la cripto): nunca importes, cuentas, movimientos ni tu nombre.
#
# · Cada activo dice de dónde sale su precio (activo.fuente_precio / codigo_precio / moneda).
# · Las series de precios se guardan en la base de datos (caché): sin conexión se sigue con el último precio conocido.
# · Todo se convierte a euros con el cambio del día (Yahoo, «USDEUR=X»).
# · Lo que falla no rompe nada: se cuenta y se enseña UNA sola vez («2 precios no se han podido actualizar»).
# · Comparador «¿y si lo hubieras metido en un indexado?»: las mismas compras y ventas en las mismas fechas, en otra cartera.
#
# Fuentes y formatos (no oficiales salvo CoinGecko; pueden cambiar sin aviso, por eso todo está aislado en este archivo):
#   Yahoo      GET {base}/v8/finance/chart/{símbolo}?range=max&interval=1d → chart.result[0].{timestamp, indicators.quote[0].close, meta}
#              GET {base}/v1/finance/search?q=…                           → quotes[{symbol, shortname, quoteType}]
#   Morningstar GET {base}/api/rest.svc/timeseries_price/{token}?id={SecId}]2]0]FOESP$$ALL&…  → [[ms, valor], …]
#   CoinGecko  GET {base}/api/v3/coins/{id}/market_chart?vs_currency=eur&days=365 → prices: [[ms, valor], …]
# Con la variable FB_PRECIOS_URL (pruebas) todo va a un servidor falso: {url}/yahoo/…, {url}/morningstar/…, {url}/coingecko/….
import datetime, json, os, re, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

FUENTES = {"yahoo": "Yahoo Finance", "morningstar": "Morningstar", "coingecko": "CoinGecko"}
BASES = {"yahoo": "https://query1.finance.yahoo.com", "morningstar": "https://lt.morningstar.com", "coingecko": "https://api.coingecko.com"}
MS_TOKEN = "t92wz0sj7c"       # el que usan las propias páginas públicas de Morningstar
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
HORAS = 6                      # los precios se consideran al día durante este tiempo
HILOS = 4
RE_CODIGO = re.compile(r"[A-Za-z0-9._=\-\^]{1,40}")
RE_ISIN = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}\d$")
REFERENCIAS = {
    "mundo": {"nombre": "MSCI World", "detalle": "ETF iShares Core MSCI World (IWDA), en euros: unas 1.400 empresas de 23 países desarrollados.", "piezas": [("IWDA.AS", 1.0)]},
    "sp500": {"nombre": "S&P 500", "detalle": "ETF iShares Core S&P 500 (SXR8), en euros: las 500 mayores empresas de EE. UU.", "piezas": [("SXR8.DE", 1.0)]},
    "6040": {"nombre": "Cartera 60/40", "detalle": "60 % MSCI World (IWDA) y 40 % bonos globales cubiertos a euros (EUNA), sin rebalancear.", "piezas": [("IWDA.AS", 0.6), ("EUNA.DE", 0.4)]},
    "sinriesgo": {"nombre": "Sin riesgo", "detalle": "ETF monetario del euro (XEON): lo que da el dinero aparcado, sin sustos.", "piezas": [("XEON.DE", 1.0)]},
}
_trabajo = {"en_marcha": False, "resultado": None}
_lock = threading.Lock()

class ErrorPrecios(Exception):
    pass

# ───────────── configuración (apagado de serie) ─────────────
def config(alm):
    c = alm.config("precios") or {}
    return {"activo": bool(c.get("activo", False)), "ultima": c.get("ultima"), "resultado": c.get("resultado")}

def guardar_config(alm, d):
    c = dict(alm.config("precios") or {})
    if "activo" in d: c["activo"] = bool(d["activo"])
    alm.set_config("precios", c)

def _exigir(alm):
    if not config(alm)["activo"]: raise ErrorPrecios("Los precios por internet están desactivados (Ajustes → Precios por internet).")

def _base(fuente):
    env = os.environ.get("FB_PRECIOS_URL")
    return f"{env.rstrip('/')}/{fuente}" if env else BASES[fuente]

def _get(url, reintentos=2, timeout=15):
    """JSON de una URL, con un reintento si es un fallo pasajero (red, 429, 5xx). Lanza ErrorPrecios con un motivo legible."""
    ultimo = None
    for i in range(reintentos + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            ultimo = f"respuesta {e.code}"
            if e.code not in (429, 500, 502, 503, 504): break
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            ultimo = "sin conexión" if not isinstance(e, urllib.error.URLError) else f"sin conexión ({getattr(e, 'reason', e)})"
        except ValueError:
            ultimo = "respuesta no válida"; break
        if i < reintentos: time.sleep(0.4 * (i + 1))
    raise ErrorPrecios(f"{urllib.parse.urlsplit(url).netloc or 'servidor'}: {ultimo}")

def _fecha_ts(ts, ms=False):
    return datetime.datetime.fromtimestamp(ts / (1000 if ms else 1), datetime.timezone.utc).date().isoformat()

# ───────────── descarga de series (cada una: {fecha: precio} en la moneda del producto) ─────────────
def serie_yahoo(simbolo, rango="max"):
    d = _get(f"{_base('yahoo')}/v8/finance/chart/{urllib.parse.quote(simbolo)}?range={rango}&interval=1d")
    try:
        res = d["chart"]["result"][0]
        cierres = res["indicators"]["quote"][0].get("close") or []
        serie = {_fecha_ts(ts): float(c) for ts, c in zip(res.get("timestamp") or [], cierres) if c is not None}
        meta = res.get("meta") or {}
    except (KeyError, IndexError, TypeError, ValueError):
        raise ErrorPrecios(f"Yahoo: no entiendo la respuesta para {simbolo}")
    if not serie: raise ErrorPrecios(f"Yahoo: {simbolo} no tiene cotizaciones")
    return serie, {"moneda": meta.get("currency") or "EUR", "nombre": meta.get("longName") or meta.get("shortName"), "mercado": meta.get("fullExchangeName") or meta.get("exchangeName")}

def serie_morningstar(secid, desde):
    q = {"currencyId": "EUR", "idtype": "Morningstar", "frequency": "daily", "startDate": desde, "endDate": datetime.date.today().isoformat(),
         "outputType": "COMPACTJSON", "id": secid + "]2]0]FOESP$$ALL"}
    d = _get(f"{_base('morningstar')}/api/rest.svc/timeseries_price/{MS_TOKEN}?" + urllib.parse.urlencode(q, safe="]$"))
    try: serie = {_fecha_ts(x[0], ms=True): float(x[1]) for x in d if x and len(x) > 1 and x[1] is not None}
    except (TypeError, ValueError, IndexError): raise ErrorPrecios(f"Morningstar: no entiendo la respuesta para {secid}")
    if not serie: raise ErrorPrecios(f"Morningstar: {secid} no tiene precios")
    return _sin_finde(serie), {"moneda": "EUR", "mercado": "Morningstar"}

def serie_coingecko(moneda, dias=365):
    d = _get(f"{_base('coingecko')}/api/v3/coins/{urllib.parse.quote(moneda)}/market_chart?vs_currency=eur&days={dias}&interval=daily")
    try: serie = {_fecha_ts(ts, ms=True): float(v) for ts, v in (d.get("prices") or []) if v is not None}
    except (TypeError, ValueError, AttributeError): raise ErrorPrecios(f"CoinGecko: no entiendo la respuesta para {moneda}")
    if not serie: raise ErrorPrecios(f"CoinGecko: {moneda} no tiene precios")
    return serie, {"moneda": "EUR", "mercado": "CoinGecko"}

def _sin_finde(serie):
    """Un valor liquidativo fechado en sábado o domingo es el del viernes (si ese viernes no tiene dato)."""
    out = {k: v for k, v in serie.items() if datetime.date.fromisoformat(k).weekday() < 5}
    for k in sorted(serie):
        f = datetime.date.fromisoformat(k)
        if f.weekday() >= 5: out.setdefault((f - datetime.timedelta(days=f.weekday() - 4)).isoformat(), serie[k])
    return out

def descargar(fuente, codigo, desde=None, completa=False):
    """({fecha: precio}, info) de una fuente. `desde`: primera fecha que interesa; con `completa`, todo el histórico."""
    if fuente == "yahoo": return serie_yahoo(codigo, "max" if completa else "1mo")
    if fuente == "morningstar": return serie_morningstar(codigo, desde or (datetime.date.today() - datetime.timedelta(days=30 if not completa else 3650)).isoformat())
    if fuente == "coingecko": return serie_coingecko(codigo, 365 if completa else 30)
    raise ErrorPrecios(f"Fuente desconocida: {fuente}")

# ───────────── caché y conversión a euros ─────────────
def _k(fuente, codigo): return f"precio_serie:{fuente}:{codigo}"

def leer_serie(alm, fuente, codigo):
    return (alm.config(_k(fuente, codigo)) or {}).get("serie") or {}

def guardar_serie(alm, fuente, codigo, serie, info):
    previa = alm.config(_k(fuente, codigo)) or {}
    s = dict(previa.get("serie") or {}); s.update(serie)
    alm.set_config(_k(fuente, codigo), {"serie": dict(sorted(s.items())), "moneda": info.get("moneda") or previa.get("moneda") or "EUR",
                                        "nombre": info.get("nombre") or previa.get("nombre"), "actualizado": datetime.datetime.now().isoformat(timespec="seconds")})

def _fx(moneda):
    """(símbolo de Yahoo para pasar `moneda` a euros, factor previo: peniques → libras)."""
    m = (moneda or "EUR").strip()
    if m in ("GBp", "GBX"): return "GBPEUR=X", 0.01
    m = m.upper()
    return (None, 1.0) if m == "EUR" else (f"{m}EUR=X", 1.0)

def valor_en(serie, fecha, margen=10):
    """Último valor conocido en o antes de `fecha` (ISO o date)."""
    f = fecha if isinstance(fecha, datetime.date) else datetime.date.fromisoformat(fecha)
    for i in range(margen + 1):
        k = (f - datetime.timedelta(days=i)).isoformat()
        if k in serie: return serie[k]
    return None

def a_euros(alm, serie, moneda):
    sim, factor = _fx(moneda)
    if not sim: return dict(serie)
    fx = leer_serie(alm, "yahoo", sim)
    if not fx: return {}
    out = {}
    for k, v in serie.items():
        x = valor_en(fx, k, 5)
        if x: out[k] = v * factor * x
    return out

# ───────────── actualizar (lo que se hace al pulsar el botón o al abrir la app) ─────────────
def _tareas(alm):
    """Lo que hay que descargar: una vez cada (fuente, código) distinto, con la primera fecha que interesa."""
    t = {}
    hoy = datetime.date.today().isoformat()
    aportaciones = alm.todos("aportacion")
    for a in alm.todos("activo"):
        if not a.get("fuente_precio") or not a.get("codigo_precio") or a.get("estado") == "vendido": continue
        fechas = [x["fecha"] for x in aportaciones if x.get("activo") == a["nombre"]] + ([a["fecha_inicio"]] if a.get("fecha_inicio") else [])
        clave = (a["fuente_precio"], a["codigo_precio"])
        d = t.setdefault(clave, {"desde": min(fechas + [hoy]), "monedas": set(), "activos": []})
        d["desde"] = min(d["desde"], min(fechas + [hoy])); d["monedas"].add(a.get("moneda") or "EUR"); d["activos"].append(a["nombre"])
    return t

def _al_dia(alm, fuente, codigo):
    r = alm.config(_k(fuente, codigo)) or {}
    if not r.get("actualizado"): return False
    return datetime.datetime.now() - datetime.datetime.fromisoformat(r["actualizado"]) < datetime.timedelta(hours=HORAS)

def actualizar(alm, forzar=False):
    """Descarga los precios de todos los activos con fuente y guarda su caché. → {actualizados, total, fallos: [{que, motivo}], hora}.
    Lanza ErrorPrecios si están desactivados. Los fallos no paran el resto."""
    _exigir(alm)
    tareas = _tareas(alm)
    fx = {(m, ) for d in tareas.values() for m in d["monedas"] if _fx(m)[0]}
    fallos, ok = [], 0
    def uno(item):
        (fuente, codigo), d = item
        previa = alm.config(_k(fuente, codigo)) or {}
        completa = not previa.get("serie") or (datetime.date.today() - datetime.date.fromisoformat(max(previa["serie"]))).days > 20 or d["desde"] < min(previa["serie"])
        if not forzar and not completa and _al_dia(alm, fuente, codigo): return item, "al día", None
        try:
            serie, info = descargar(fuente, codigo, desde=d["desde"] if fuente == "morningstar" else None, completa=completa)
            guardar_serie(alm, fuente, codigo, serie, info)
            return item, "ok", None
        except ErrorPrecios as e: return item, "fallo", str(e)
    with ThreadPoolExecutor(HILOS) as ex: res = list(ex.map(uno, tareas.items()))
    for item, estado, motivo in res:
        if estado == "fallo": fallos.append({"que": ", ".join(tareas[item[0]]["activos"]), "motivo": motivo})
        else: ok += 1
    # Cambios de moneda de lo que no cotiza en euros
    for (m,) in fx:
        sim = _fx(m)[0]
        try:
            if not _al_dia(alm, "yahoo", sim) or forzar:
                serie, info = serie_yahoo(sim, "max" if not leer_serie(alm, "yahoo", sim) else "1mo"); guardar_serie(alm, "yahoo", sim, serie, info)
        except ErrorPrecios as e: fallos.append({"que": f"cambio {m}→EUR", "motivo": str(e)})
    guardar_ultimos(alm, tareas)
    hora = datetime.datetime.now().isoformat(timespec="seconds")
    resultado = {"actualizados": ok, "total": len(tareas), "fallos": fallos, "hora": hora}
    c = dict(alm.config("precios") or {}); c["ultima"] = hora; c["resultado"] = resultado; alm.set_config("precios", c)
    return resultado

def guardar_ultimos(alm, tareas=None):
    """Para cada activo con fuente: su último precio en euros y los de fin de mes (para la página)."""
    out = {}
    for a in alm.todos("activo"):
        f, c = a.get("fuente_precio"), a.get("codigo_precio")
        if not f or not c: continue
        serie = a_euros(alm, leer_serie(alm, f, c), a.get("moneda") or "EUR")
        if not serie: continue
        ultimo = max(serie)
        mensual = {}
        for k in sorted(serie): mensual[k[:7]] = round(serie[k], 6)   # el último día de cada mes con dato
        out[a["nombre"]] = {"precio": round(serie[ultimo], 6), "fecha": ultimo, "fuente": f, "codigo": c, "moneda": a.get("moneda") or "EUR",
                            "mensual": dict(list(mensual.items())[-48:])}
    alm.set_config("precio_ultimos", out)
    return out

def para_la_pagina(alm):
    """Lo que ve la página: el estado y el último precio de cada activo (las series enteras se quedan aquí)."""
    c = config(alm)
    return {**c, "en_marcha": _trabajo["en_marcha"], "activos": alm.config("precio_ultimos") or {}, "viejo": _viejo(c)}

def _viejo(c):
    if not c["activo"]: return False
    if not c["ultima"]: return True
    return datetime.datetime.now() - datetime.datetime.fromisoformat(c["ultima"]) > datetime.timedelta(hours=HORAS)

# ───────────── en segundo plano (la app no se queda esperando) ─────────────
def actualizar_en_segundo_plano(alm, forzar=False):
    with _lock:
        if _trabajo["en_marcha"]: return False
        _trabajo.update(en_marcha=True, resultado=None)
    def hacer():
        try: _trabajo["resultado"] = {"ok": True, **actualizar(alm, forzar)}
        except ErrorPrecios as e: _trabajo["resultado"] = {"ok": False, "mensaje": str(e)}
        except Exception as e: _trabajo["resultado"] = {"ok": False, "mensaje": f"Error inesperado: {e}"}
        finally: _trabajo["en_marcha"] = False
    threading.Thread(target=hacer, daemon=True).start()
    return True

def estado(alm):
    """Si hay una actualización en marcha y cómo acabó la última de este arranque ({ok, …}; None si aún no ha terminado ninguna)."""
    return {**config(alm), "en_marcha": _trabajo["en_marcha"], "resultado": _trabajo["resultado"]}

def mensaje_resultado(r):
    """UNA frase para todo lo que ha pasado (los detalles, plegados en la página)."""
    if not r: return ""
    n = len(r.get("fallos") or [])
    base = f"{r['actualizados']} precio{'s' if r['actualizados'] != 1 else ''} al día"
    return base + (f" · {n} no se {'han' if n != 1 else 'ha'} podido actualizar" if n else "")

# ───────────── buscar un producto por ISIN, ticker o nombre ─────────────
def _yahoo_buscar(q, n=8):
    d = _get(f"{_base('yahoo')}/v1/finance/search?" + urllib.parse.urlencode({"q": q, "quotesCount": n, "newsCount": 0}))
    return [x for x in (d.get("quotes") or []) if x.get("symbol")]

def _ms_buscar(isin):
    q = {"page": 1, "pageSize": 10, "outputType": "json", "version": 1, "languageId": "es-ES", "currencyId": "EUR", "universeIds": "FOESP$$ALL|ETEUR$$ALL",
         "securityDataPoints": "SecId|Name|isin|Universe|PriceCurrency|ExchangeId|Ticker|OngoingCharge|CollectedSRRI|CategoryName|BrandingCompanyName", "term": isin}
    return (_get(f"{_base('morningstar')}/api/rest.svc/klr5zyak8x/security/screener?" + urllib.parse.urlencode(q)).get("rows")) or []

def _cg_buscar(q):
    return (_get(f"{_base('coingecko')}/api/v3/search?" + urllib.parse.urlencode({"query": q})).get("coins")) or []

def _intenta(fn, *a):
    try: return fn(*a)
    except ErrorPrecios: return []

TIPO_YAHOO = {"EQUITY": "accion", "ETF": "etf", "MUTUALFUND": "fondo", "CRYPTOCURRENCY": "cripto", "FUTURE": "materia"}
ATAJOS = {"oro": ("GC=F", "Oro (onza troy, futuro COMEX)"), "gold": ("GC=F", "Oro (onza troy, futuro COMEX)"), "plata": ("SI=F", "Plata (futuro COMEX)"),
          "cobre": ("HG=F", "Cobre (libra, futuro COMEX)"), "petroleo": ("BZ=F", "Petróleo Brent (barril)")}

def buscar(alm, texto):
    """Candidatos con precio comprobado, los más probables primero: [{fuente, codigo, nombre, tipo, moneda, precio, fecha, mercado, ficha}].
    Solo se envía el texto que escribes (un ISIN, un ticker o un nombre)."""
    _exigir(alm)
    q = (texto or "").strip()
    if not q or len(q) > 60: return []
    cands = []
    def añade(fuente, codigo, nombre, tipo, ficha=None):
        if not any(c["fuente"] == fuente and c["codigo"] == codigo for c in cands): cands.append({"fuente": fuente, "codigo": codigo, "nombre": nombre, "tipo": tipo, "ficha": ficha or {}})
    if q.lower() in ATAJOS: añade("yahoo", ATAJOS[q.lower()][0], ATAJOS[q.lower()][1], "materia")
    if RE_ISIN.match(q.upper()):
        filas, quotes = _intenta(_ms_buscar, q.upper()), _intenta(_yahoo_buscar, q.upper())
        cero_p = next((x["symbol"].split(".")[0] for x in quotes if x["symbol"].startswith("0P")), None)
        ficha = {}
        f0 = next((f for f in filas if f.get("OngoingCharge") is not None or f.get("CollectedSRRI")), None)
        if f0: ficha = {k: v for k, v in {"ter": f0.get("OngoingCharge"), "riesgo": f0.get("CollectedSRRI"), "categoria": f0.get("CategoryName"), "gestora": f0.get("BrandingCompanyName")}.items() if v not in (None, "")}
        for f in filas:
            if (f.get("Universe") or "").startswith("FO"): añade("morningstar", cero_p or f["SecId"], f.get("Name"), "fondo", ficha); cero_p = None
        for x in quotes:
            if x["symbol"].startswith("0P"): continue
            añade("yahoo", x["symbol"], x.get("longname") or x.get("shortname"), TIPO_YAHOO.get(x.get("quoteType"), "otro"), ficha)
    else:
        monedas = _intenta(_cg_buscar, q)
        for x in _intenta(_yahoo_buscar, q):
            if x.get("quoteType") in TIPO_YAHOO: añade("yahoo", x["symbol"], x.get("longname") or x.get("shortname"), TIPO_YAHOO[x["quoteType"]])
        if not any(c["tipo"] == "cripto" for c in cands):
            for c in [c for c in monedas if c.get("market_cap_rank")][:3]: añade("coingecko", c["id"], c.get("name"), "cripto")
    cands = cands[:10]
    def probar(c):
        try:
            serie, info = descargar(c["fuente"], c["codigo"])
            u = max(serie)
            return {**c, "precio": round(serie[u], 4), "fecha": u, "moneda": info.get("moneda") or "EUR", "mercado": info.get("mercado"), "nombre": c["nombre"] or info.get("nombre")}
        except ErrorPrecios: return None
    with ThreadPoolExecutor(HILOS) as ex: res = [r for r in ex.map(probar, cands) if r]
    return sorted(res, key=lambda c: (c["fuente"] != "morningstar", c["codigo"].upper() != q.upper(), c["moneda"] != "EUR"))

def autoconfigurar(alm):
    """Busca el precio de los activos que tienen ISIN y aún no tienen fuente, y se queda con el primer candidato (con un ISIN,
    Morningstar da el fondo exacto). Rellena fuente, código, moneda y el TER si falta. → {configurados: [nombre], sin_resultado: [nombre]}."""
    _exigir(alm)
    out = {"configurados": [], "sin_resultado": []}
    for a in alm.todos("activo"):
        if a.get("fuente_precio") or a.get("estado") == "vendido" or not RE_ISIN.match((a.get("isin") or "").upper()): continue
        try: c = buscar(alm, a["isin"])
        except ErrorPrecios: c = []
        if not c: out["sin_resultado"].append(a["nombre"]); continue
        mejor = c[0]
        cambios = {"fuente_precio": mejor["fuente"], "codigo_precio": mejor["codigo"], "moneda": mejor["moneda"] or "EUR"}
        if not a.get("ter") and (mejor.get("ficha") or {}).get("ter") is not None: cambios["ter"] = mejor["ficha"]["ter"]
        alm.guardar("activo", {**a, **cambios}, a["id"])
        out["configurados"].append(a["nombre"])
    return out

def validar_fuente(fuente, codigo, moneda):
    """(fuente, código, moneda) limpios, o ValueError con un mensaje legible."""
    if fuente in ("", None): return "", "", "EUR"
    if fuente not in FUENTES: raise ValueError("La fuente del precio no es válida.")
    codigo = str(codigo or "").strip()
    if not RE_CODIGO.fullmatch(codigo): raise ValueError("El código del precio no es válido (letras, números, punto o guion).")
    moneda = str(moneda or "EUR").strip() or "EUR"
    if not re.fullmatch(r"[A-Za-z]{3}", moneda): raise ValueError("La moneda debe ser un código de tres letras (EUR, USD…).")
    return fuente, codigo, moneda

# ───────────── comparador: ¿y si lo hubieras metido en un indexado? ─────────────
def _flujos(alm):
    """Tu dinero puesto (+) y sacado (−) en tu inversión, con fechas: compras y ventas (sin los traspasos entre fondos) y lo
    aportado antes de usar la app. Sin importes de otros usos."""
    f = []
    for a in alm.todos("activo"):
        if a.get("aportado_inicial") and a.get("fecha_inicio"): f.append((a["fecha_inicio"], float(a["aportado_inicial"])))
    for x in alm.todos("aportacion"):
        if x.get("ajuste") or x.get("traspaso") or not x.get("importe"): continue
        f.append((x["fecha"], float(x["importe"])))
    return sorted(f)

def _xirr(flujos):
    """flujos: [(date, importe)], negativo = pones, positivo = recibes/vale. → tasa anual o None."""
    if len(flujos) < 2 or not any(v < 0 for _, v in flujos) or not any(v > 0 for _, v in flujos): return None
    f0 = min(f for f, _ in flujos)
    def van(r): return sum(v / (1 + r) ** ((f - f0).days / 365.0) for f, v in flujos)
    lo, hi = -0.99, 10.0
    try: vlo, vhi = van(lo), van(hi)
    except (ZeroDivisionError, OverflowError): return None
    if vlo * vhi > 0: return None
    for _ in range(200):
        mid = (lo + hi) / 2; vm = van(mid)
        if abs(vm) < 1e-7: return mid
        if vlo * vm <= 0: hi = mid
        else: lo, vlo = mid, vm
    return (lo + hi) / 2

def comparar(alm, ref):
    """Tus mismas compras y ventas, en las mismas fechas, en otra cartera. → {nombre, detalle, meses, valor, aportado, hoy, puesto, tir, desde, avisos}."""
    _exigir(alm)
    R = REFERENCIAS.get(ref)
    if not R: raise ErrorPrecios("Esa cartera de comparación no existe.")
    flujos = _flujos(alm)
    if not flujos: raise ErrorPrecios("Aún no tienes compras anotadas para comparar.")
    desde = flujos[0][0]
    series, avisos = {}, []
    for sim, _ in R["piezas"]:
        previa = leer_serie(alm, "yahoo", sim)
        if not previa or min(previa) > desde or (datetime.date.today() - datetime.date.fromisoformat(max(previa))).days > 5:
            try: s, info = serie_yahoo(sim, "max"); guardar_serie(alm, "yahoo", sim, s, info); previa = leer_serie(alm, "yahoo", sim)
            except ErrorPrecios as e:
                if not previa: raise
                avisos.append(f"No se han podido actualizar los precios de {sim}: {e}")
        series[sim] = a_euros(alm, previa, (alm.config(_k("yahoo", sim)) or {}).get("moneda") or "EUR")
        if not series[sim]: raise ErrorPrecios(f"No hay precios de {sim} en euros.")
        if min(series[sim]) > desde: avisos.append(f"Tus primeras compras ({desde}) son anteriores a los precios de {sim} ({min(series[sim])}): esas se cuentan desde esa fecha.")
    unidades = {sim: [] for sim, _ in R["piezas"]}   # [(fecha, unidades)]
    for fecha, imp in flujos:
        for sim, w in R["piezas"]:
            p = valor_en(series[sim], max(fecha, min(series[sim])), 10)
            if p: unidades[sim].append((fecha, w * imp / p))
    def valor_a(fecha):
        total = 0.0
        for sim, _ in R["piezas"]:
            u = sum(x for f, x in unidades[sim] if f <= fecha)
            p = valor_en(series[sim], fecha, 10)
            total += u * (p or 0)
        return total
    hoy = min(max(max(s) for s in series.values()), datetime.date.today().isoformat())
    meses, valor, aportado = [], [], []
    k = datetime.date.fromisoformat(desde[:7] + "-01")
    while k.isoformat()[:7] <= hoy[:7]:
        fin = min((k.replace(day=28) + datetime.timedelta(days=4)).replace(day=1) - datetime.timedelta(days=1), datetime.date.fromisoformat(hoy)).isoformat()
        meses.append(k.isoformat()[:7]); valor.append(round(valor_a(fin), 2)); aportado.append(round(sum(i for f, i in flujos if f <= fin), 2))
        k = (k.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    hoy_valor = valor_a(hoy)
    tir = _xirr([(datetime.date.fromisoformat(f), -i) for f, i in flujos] + [(datetime.date.fromisoformat(hoy), hoy_valor)])
    return {"nombre": R["nombre"], "detalle": R["detalle"], "meses": meses, "valor": valor, "aportado": aportado, "hoy": round(hoy_valor, 2),
            "puesto": round(sum(i for _, i in flujos), 2), "tir": None if tir is None else round(tir, 4), "desde": desde, "fecha": hoy, "avisos": avisos}
