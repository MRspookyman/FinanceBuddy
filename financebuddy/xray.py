# Informe «X-Ray de Cartera» de Morningstar (PDF; lo dan MyInvestor y otros brókers): qué hay dentro de tus fondos.
#
# Se lee el texto del PDF (pypdf, sin conexión) y se sacan: reparto por tipo de activo, países, regiones, sectores,
# las 10 mayores posiciones, rentabilidad y riesgo de la cartera y, por cada fondo, su rentabilidad, gastos corrientes
# y peso. Se guarda como registro «composicion» y se enlaza con tus activos por el nombre del fondo.
import datetime, difflib, io, os, re
from . import modelo
from .lectura import norm

MESES = {m: i for i, m in enumerate(["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"], 1)}
MESES_EN = {"jan": 1, "apr": 4, "aug": 8, "dec": 12}
TIPOS = [("acciones", "Acciones"), ("renta_fija", "Obligaciones"), ("efectivo", "Efectivo"), ("otro", "Otro"), ("no_clasificado", "No clasificado")]
REGIONES = ["Europa", "América", "Asia"]
SECTORES = ["Materiales Básicos", "Consumo Cíclico", "Servicios Financieros", "Inmobiliario", "Servicios de Comunicación", "Energía",
            "Industria", "Tecnología", "Consumo Defensivo", "Salud", "Servicios Públicos"]
SUPER = {"ciclico": "Cíclico", "sensible": "Sensible al ciclo", "defensivo": "Defensivo"}
TIPOS_POSICION = r"Acción|Bono|Obligación|Fondo|Efectivo|ETF|Derivado|Otro"

def texto_pdf(origen):
    """Texto de cada página (sin el aviso legal del pie). origen: ruta o bytes."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ValueError("Para leer PDF hace falta el componente pypdf (pip install pypdf).")
    datos = origen if isinstance(origen, (bytes, bytearray)) else open(origen, "rb").read()
    try:
        paginas = [p.extract_text() or "" for p in PdfReader(io.BytesIO(datos)).pages]
    except Exception as e:
        raise ValueError(f"No se puede leer el PDF ({e}).")
    return "\n".join(re.split(r"\n?©\s*\d{4}", p)[0] for p in paginas)

def _n(s):
    s = str(s or "").strip()
    if s in ("", "-", "–"): return None
    try: return float(s.replace(".", "").replace(",", "."))
    except ValueError: return None

def _palabras(nombre):  # «Servicios de Comunicación» → patrón que admite saltos de línea entre palabras
    return r"\s+".join(re.escape(w) for w in nombre.split())

def _seccion(t, desde, hasta):
    i = t.find(desde)
    if i < 0: return ""
    j = t.find(hasta, i + len(desde)) if hasta else -1
    return t[i + len(desde): j if j >= 0 else None]

def _fecha(t):
    m = re.search(r"Informe a (\d{1,2}) (\w{3})\w*\.? (\d{4})", t)
    if not m: return None
    mes = MESES.get(norm(m.group(2))[:3]) or MESES_EN.get(norm(m.group(2))[:3])
    try: return datetime.date(int(m.group(3)), mes, int(m.group(1))).isoformat() if mes else None
    except ValueError: return None

def analizar(t):
    """Texto de un X-Ray → dict con lo que se ha podido leer. Lanza ValueError si no parece un X-Ray."""
    plano = re.sub(r"\s+", " ", t)
    out = {"fecha": _fecha(t)}
    # Tipos de activo (cartera y referencia)
    dist = re.sub(r"\s+", " ", _seccion(t, "Distribución de activos", "Desglose por regiones"))
    out["tipos"] = {k: _n(m.group(1)) for k, et in TIPOS if (m := re.search(rf"{_palabras(et)} (-?[\d.,]+) (-?[\d.,]+)", dist))}
    # Países (de la parte en acciones)
    paises = []
    for linea in _seccion(t, "Exposición por país", "Desglose por regiones").splitlines():
        m = re.match(r"^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'/-]*?)\s+(\d+,\d+)\s+(\d+,\d+)\s*$", linea)
        if m and m.group(1).strip() not in {et for _, et in TIPOS}: paises.append([m.group(1).strip(), _n(m.group(2))])
    out["paises"] = sorted(paises, key=lambda x: -x[1])
    reg = re.sub(r"\s+", " ", _seccion(t, "Desglose por regiones", "Sectores de Renta Variable"))
    out["regiones"] = {r: _n(m.group(1)) for r in REGIONES if (m := re.search(rf"(?:^| ){r} (\d+,\d+) (\d+,\d+)", reg))}
    # Sectores (y los tres grandes grupos: cíclico, sensible al ciclo, defensivo)
    sec = re.sub(r"\s+", " ", _seccion(t, "Sectores de Renta Variable", "Estilo de inversión"))
    out["sectores"] = sorted([[s, _n(m.group(1))] for s in SECTORES if (m := re.search(rf"{_palabras(s)} (\d+,\d+) (\d+,\d+)", sec))], key=lambda x: -x[1])
    out["grupos_sector"] = {k: _n(m.group(1)) for k, et in SUPER.items() if (m := re.search(rf"(?<!Consumo ){_palabras(et)} (\d+,\d+) (\d+,\d+)", sec))}
    # Ratios de las acciones
    out["ratios"] = {k: _n(m.group(1)) for k, et in (("per", "Precio/Beneficio"), ("pvc", "Precio/Valor Contable"), ("pcf", "Precio/Cashflow"))
                     if (m := re.search(rf"{_palabras(et)} (\d+,\d+)", plano))}
    # Las 10 mayores posiciones: «8,30 NVIDIA Corp Acción Tecnología Estados Unidos»
    top = []
    for linea in _seccion(t, "Las 10 principales posiciones", "Morningstar Rendimiento").splitlines():
        m = re.match(rf"^\s*(\d+,\d+)\s+(.+?)\s+({TIPOS_POSICION})\s+(.+?)\s*$", linea)
        if not m: continue
        resto = m.group(4)
        sector = next((s for s in SECTORES if resto.startswith(s)), "")
        top.append({"peso": _n(m.group(1)), "nombre": m.group(2), "tipo": m.group(3), "sector": sector, "pais": resto[len(sector):].strip()})
    out["top"] = top
    # Rentabilidad (cartera) y riesgo
    ren = re.sub(r"\s+", " ", _seccion(t, "Rentab. acum.", "Rentab. por periodos"))
    out["rentabilidad"] = {k: _n(m.group(1)) for k, pat in (("3m", r"3 meses"), ("6m", r"6 meses"), ("1a", r"1 año"), ("3a", r"3 Años Anualizado"),
                                                           ("5a", r"5 Años Anualizado"), ("ytd", r"(?<![\w])Año")) if (m := re.search(rf"{pat} (-?[\d,]+)", ren))}
    ries = re.sub(r"\s+", " ", _seccion(t, "Estadísticas de Rentabilidad y Riesgo", None))
    out["riesgo"] = {k: _n(m.group(1)) for k, et in (("volatilidad", "Volatilidad"), ("sharpe", "Ratio de Sharpe")) if (m := re.search(rf"{et} (-?[\d,]+)", ries))}
    # Fondos de la cartera: «Fidelity S&P 500 Index EUR P Acc Fondo 28 sep. 2026 QQQQ 20,85 17,82 12,65 0,06 100,00»
    fondos = []
    for linea in _seccion(t, "Posiciones de Cartera", None).splitlines():
        m = re.match(r"^\s*(.+?)\s+(Fondo|ETF|Acción|Plan de pensiones|Otro)\s+(\d{1,2} \w+\.? \d{4})\s+(\S*?)\s*"
                     r"(-|-?[\d,]+)\s+(-|-?[\d,]+)\s+(-|-?[\d,]+)\s+(-|-?[\d,]+)\s+([\d,]+)\s*$", linea)
        if m: fondos.append({"nombre": m.group(1), "tipo": m.group(2), "estrellas": len(re.findall(r"[Q★*]", m.group(4))) or None,
                             "r1": _n(m.group(5)), "r3": _n(m.group(6)), "r5": _n(m.group(7)), "ter": _n(m.group(8)), "peso": _n(m.group(9))})
    out["fondos"] = fondos
    if not out["tipos"] and not out["paises"] and not fondos:
        raise ValueError("Este PDF no parece un informe X-Ray de Morningstar.")
    return out

def enlazar(fondos, activos):
    """Nombre de cada fondo del X-Ray → el activo tuyo que más se le parece (o None)."""
    def parecido(a, b):
        a, b = norm(a), norm(b)
        return 1.0 if a in b or b in a else difflib.SequenceMatcher(None, a, b).ratio()
    out = {}
    for f in fondos:
        mejor = max(activos, key=lambda a: parecido(f["nombre"], a["nombre"]), default=None)
        out[f["nombre"]] = mejor["nombre"] if mejor and parecido(f["nombre"], mejor["nombre"]) >= 0.72 else None
    return out

def importar(alm, ruta):
    """Lee un X-Ray (PDF) y lo guarda como composición. Pone los gastos corrientes a los activos enlazados que no los tengan."""
    datos = analizar(texto_pdf(ruta))
    activos = alm.todos("activo")
    enl = enlazar(datos["fondos"], activos)
    datos["enlaces"] = enl
    fecha = datos.get("fecha") or datetime.date.today().isoformat()
    with alm.transaccion():
        for f in datos["fondos"]:
            a = next((x for x in activos if x["nombre"] == enl.get(f["nombre"])), None)
            if a and f.get("ter") is not None and a.get("ter") in (None, ""): alm.guardar("activo", {**a, "ter": f["ter"]}, a["id"])
        ya = next((c for c in alm.todos("composicion") if c.get("fecha") == fecha and c.get("nombre") == os.path.basename(ruta)), None)
        alm.guardar("composicion", {"fecha": fecha, "nombre": os.path.basename(ruta), "datos": datos,
                                    "activos": [v for v in enl.values() if v]}, ya["id"] if ya else None)
    t = datos.get("tipos") or {}
    p = (datos.get("paises") or [[None, None]])[0]
    partes = [f"{len(datos['fondos'])} fondo{'s' if len(datos['fondos']) != 1 else ''}" if datos["fondos"] else None,
              f"{t['acciones']:.1f} % acciones".replace(".", ",") if t.get("acciones") is not None else None,
              f"{p[1]:.1f} % {p[0]}".replace(".", ",") if p[0] else None]
    sin = [n for n, v in enl.items() if not v]
    return {"ok": True, "tipo": "xray", "fondos_sin_activo": sin,
            "mensaje": f"X-Ray del {'/'.join(reversed(fecha.split('-')))}: " + " · ".join(x for x in partes if x)
                       + (f" · «{sin[0]}» no está entre tus activos: créalo en Inversión" if sin else "")}
