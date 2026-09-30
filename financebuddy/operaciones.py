# Órdenes y operaciones del bróker con participaciones: el CSV de «Órdenes» de fondos de MyInvestor (ISIN, importe,
# participaciones, estado) o un Excel de operaciones (fecha, compra/venta, activo, títulos).
#
# Completan lo que no dice el extracto de la cuenta de efectivo: cuántas participaciones compras o vendes y los
# traspasos entre fondos (que no pasan por la cuenta). Nunca duplican lo que ya trae ese extracto: una orden y un
# movimiento de la cuenta del mismo activo, importe (±1 %) y fecha (±6 días) son la misma operación, se importe
# antes uno u otro.
import datetime, os, re
from collections import Counter
from . import clasificar as C, lectura as L, modelo, plantilla

DIAS = 6
RE_ISIN = re.compile(r"\b[A-Z]{2}[A-Z0-9]{9}\d\b")
ESTADOS_OK = ("finalizad", "ejecutad", "completad", "liquidad", "realizad", "confirmad")

def cerca(a, b):
    return abs(abs(a) - abs(b)) <= max(1.0, 0.01 * max(abs(a), abs(b)))

def dias(a, b):
    return abs((datetime.date.fromisoformat(a) - datetime.date.fromisoformat(b)).days)

def clave(o): return o["isin"] or L.norm(o["texto"])

# ───────────── leer el archivo ─────────────
def leer(ruta, alm, perfil_nombre=None):
    """→ (perfil, operaciones, descartadas). Operación: {fecha, isin, texto, importe (≥0 o None), part (≥0 o None),
    signo (+1 compra, −1 venta, None si el archivo no lo dice)}. Se descartan las órdenes canceladas o rechazadas."""
    crudas = L.filas_crudas(ruta)
    perfiles = [p for p in alm.todos("perfil") if p.get("tipo") == "operaciones" and (not perfil_nombre or p["nombre"] == perfil_nombre)]
    rec = L.reconocer(crudas, perfiles)
    if not rec: raise ValueError("No reconozco las columnas de este archivo de operaciones.")
    perfil, i, idx = rec
    ops, descartadas = [], 0
    for f in crudas[i + 1:]:
        cel = lambda k: f[idx[k]] if k in idx and idx[k] < len(f) else None
        fecha = L.fecha(cel("fecha"))
        if not fecha: continue
        if "estado" in idx and not L.norm(cel("estado")).startswith(ESTADOS_OK): descartadas += 1; continue
        imp, part = L.numero(cel("importe")), L.numero(cel("participaciones"))
        if not imp and not part: descartadas += 1; continue
        tipo = L.norm(cel("tipo"))
        signo = -1 if re.match(r"venta|vender|reembolso|sell", tipo) else 1 if re.match(r"compra|comprar|suscripcion|buy", tipo) else None
        m = RE_ISIN.search(L.texto(cel("isin")).upper() + " " + L.texto(cel("activo")).upper())
        ops.append({"fecha": fecha, "isin": m.group(0) if m else "", "texto": L.texto(cel("activo")) or (m.group(0) if m else ""),
                    "importe": round(abs(imp), 2) if imp else None, "part": abs(part) if part else None, "signo": signo})
    if not ops and not descartadas: raise ValueError("El archivo no tiene operaciones.")
    return perfil, sorted(ops, key=lambda o: o["fecha"]), descartadas

def deducir_signos(ops):
    """Órdenes que no dicen si son compra o venta (MyInvestor): dos órdenes de fondos distintos por el mismo importe en
    pocos días son un traspaso entre fondos: la primera es la venta y la segunda la compra (el mismo día, vende el
    fondo que más veces vende en los demás traspasos). Las demás se suponen compras (`supuesta`). Devuelve los traspasos."""
    sin = [o for o in ops if o["signo"] is None and o["importe"]]
    pares = []
    for i, a in enumerate(sin):
        for b in sin[i + 1:]:
            d = dias(a["fecha"], b["fecha"])
            if clave(a) != clave(b) and d <= DIAS and cerca(a["importe"], b["importe"]):
                pares.append((abs(a["importe"] - b["importe"]), d, i, a, b))
    usados, elegidos = set(), []
    for _, _, _, a, b in sorted(pares, key=lambda x: x[:3]):
        if id(a) in usados or id(b) in usados: continue
        usados |= {id(a), id(b)}
        elegidos.append((a, b) if a["fecha"] <= b["fecha"] else (b, a))
    vende = Counter(clave(a) for a, b in elegidos if a["fecha"] < b["fecha"])
    for a, b in elegidos:
        if a["fecha"] == b["fecha"] and vende[clave(b)] > vende[clave(a)]: a, b = b, a
        a["signo"], b["signo"] = -1, 1
        a["traspaso"] = b["traspaso"] = True
    for o in ops:
        if o["signo"] is None: o["signo"], o["supuesta"] = 1, True
    return len(elegidos)

# ───────────── el activo de cada operación ─────────────
def activo_de(alm, o, cuenta):
    """El activo de la operación: por ISIN, por el catálogo de ISIN conocidos o por el nombre; si no existe, se crea."""
    activos = alm.todos("activo")
    tn = L.norm(o["texto"])
    if o["isin"]:
        a = next((a for a in activos if (a.get("isin") or "").upper() == o["isin"]), None)
        if a: return a["nombre"], False
        nombre, clase, patrones = plantilla.ISIN.get(o["isin"], (f"Fondo {o['isin']}", "fondo", []))
    else:
        a = next((a for a in activos if any(C.casa(p, tn) for p in a.get("patrones") or []) or C.casa(a["nombre"], tn)), None)
        if a: return a["nombre"], False
        from .importar import nombre_activo, clase_activo
        nombre, clase = nombre_activo(o["texto"]), clase_activo(o["texto"])
        patrones = [L.norm(nombre)]
    # Ya existe con ese nombre o lo reconocen sus patrones (creado desde el extracto de la cuenta): se le pone el ISIN
    nn = L.norm(nombre)
    a = next((a for a in activos if L.norm(a["nombre"]) == nn or any(C.casa(p, nn) for p in a.get("patrones") or [])
              or any(C.casa(p, L.norm(a["nombre"])) for p in patrones)), None)
    if a:
        pat = (a.get("patrones") or []) + [p for p in patrones if p not in (a.get("patrones") or [])]
        alm.guardar("activo", {**a, "isin": a.get("isin") or o["isin"], "patrones": pat}, a["id"])
        return a["nombre"], False
    alm.guardar("activo", {"nombre": nombre, "clase": clase, "cuenta": cuenta, "fecha_inicio": o["fecha"], "aportado_inicial": 0,
                           "isin": o["isin"], "patrones": patrones})
    return nombre, True

# ───────────── casar una orden con lo ya importado ─────────────
def huella(o, activo):
    return "|".join(str(x) for x in (o["fecha"], o["isin"] or activo, o["importe"] or "", o["part"] or ""))

def _part(o, signo):
    return round(signo * o["part"], 6) if o["part"] else None

def casar_orden(alm, o, activo, cuenta):
    """Intenta que la orden complete algo ya importado. → 'existente' | 'completada' | 'desde_revisar' | None."""
    h = huella(o, activo)
    aps = alm.todos("aportacion")
    if any(a.get("orden") == h for a in aps): return "existente"
    # Una aportación del extracto de la cuenta (u otra orden de otro archivo) del mismo activo, fecha e importe
    cand = [a for a in aps if a["activo"] == activo and not a.get("orden") and dias(a["fecha"], o["fecha"]) <= DIAS
            and (o.get("supuesta") or (float(a["importe"]) > 0) == (o["signo"] > 0))
            and (cerca(float(a["importe"]), o["importe"]) if o["importe"] else True)]
    if o["importe"] is None:  # sin importe (Excel de títulos): la más cercana en fecha que aún no tenga participaciones
        cand = [a for a in cand if a.get("participaciones") in (None, "") or abs(abs(float(a["participaciones"])) - o["part"]) < 1e-6]
    if cand:
        a = min(cand, key=lambda a: dias(a["fecha"], o["fecha"]))
        signo = 1 if float(a["importe"]) > 0 else -1
        cambios = {"orden": h}
        if a.get("participaciones") in (None, "") and o["part"]: cambios["participaciones"] = _part(o, signo)
        alm.guardar("aportacion", {**a, **cambios}, a["id"])
        return "completada"
    if o["importe"] is None: return None
    # Un movimiento del bróker que se quedó «por revisar»: es esta orden si su texto nombra el activo (o, si el activo
    # no tiene nombre conocido, si parece una compra/venta y el sentido cuadra)
    a = next((x for x in alm.todos("activo") if x["nombre"] == activo), {})
    cand = []
    for p in alm.todos("pendiente"):
        f = p.get("fila") or {}
        if p.get("tipo_import") != "inversion" or not f.get("importe") or dias(f["op"], o["fecha"]) > DIAS or not cerca(f["importe"], o["importe"]): continue
        signo = 1 if f["importe"] < 0 else -1  # sale dinero de la cuenta = compra; entra = venta
        if nombra(a, f["texto"]): cand.append((0, abs(abs(f["importe"]) - o["importe"]), dias(f["op"], o["fecha"]), p["id"], p, signo))
        elif sin_nombre(a) and parece_operacion(f["texto"]) and signo == o["signo"]: cand.append((1, abs(abs(f["importe"]) - o["importe"]), dias(f["op"], o["fecha"]), p["id"], p, signo))
    if cand:
        *_, p, signo = min(cand, key=lambda x: x[:4])
        f = p["fila"]
        alm.insertar_crudo("aportacion", modelo.limpiar("aportacion", {
            "fecha": f["op"], "activo": activo, "importe": signo * abs(f["importe"]), "participaciones": _part(o, signo), "cuenta": p["cuenta"],
            "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"], "orden": h}))
        aprender_patron(alm, activo, f["texto"])
        alm.borrar("pendiente", p["id"])
        return "desde_revisar"
    return None

def nombra(activo, texto):
    """El texto del extracto nombra este activo (por sus patrones, su nombre o su ISIN)."""
    tn = L.norm(texto)
    return bool(activo) and (any(C.casa(p, tn) for p in activo.get("patrones") or []) or C.casa(activo["nombre"], tn)
                             or bool(activo.get("isin") and activo["isin"].lower() in tn))

def sin_nombre(activo):
    """Activo creado solo por su ISIN (sin nombre conocido): no hay texto con el que reconocerlo en el extracto."""
    return bool(activo) and not activo.get("patrones")

def parece_operacion(texto):
    """Un movimiento de la cuenta del bróker que puede ser una compra/venta (no un traspaso, intereses ni comisión)."""
    from .importar import RE_TRASPASO
    tn = L.norm(texto)
    return not RE_TRASPASO.search(tn) and not re.match(r"periodo|interes|remuneracion|comision", tn)

def aprender_patron(alm, activo, texto):
    """El texto con el que el activo aparece en el extracto de la cuenta pasa a reconocerlo la próxima vez."""
    from .importar import nombre_activo
    pat = L.norm(nombre_activo(texto))
    a = next((x for x in alm.todos("activo") if x["nombre"] == activo), None)
    if a and pat and len(pat) >= 5 and pat not in (a.get("patrones") or []):
        alm.guardar("activo", {**a, "patrones": (a.get("patrones") or []) + [pat]}, a["id"])

def casar_movimiento(alm, fila, cuenta, activo=None, signo_compra=-1):
    """Al importar el extracto de la cuenta del bróker: si una orden ya importada es esta misma operación, se le añade
    la huella del extracto (para no duplicarla) y, si su compra/venta era supuesta, se corrige. → True si la ha casado."""
    imp = fila["importe"]
    signo = 1 if imp * signo_compra > 0 else -1  # + compra, − venta
    if not activo and not parece_operacion(fila["texto"]): return False
    activos = {x["nombre"]: x for x in alm.todos("activo")}
    for a in alm.todos("aportacion"):
        if not a.get("orden") or a.get("ext_fecha") or (activo and a["activo"] != activo): continue
        if not activo and not (sin_nombre(activos.get(a["activo"])) and ((float(a["importe"]) > 0) == (signo > 0))): continue
        if dias(a["fecha"], fila["op"]) > DIAS or not cerca(float(a["importe"]), imp): continue
        if (float(a["importe"]) > 0) != (signo > 0) and not a.get("supuesta"): continue
        d = {**a, "ext_texto": fila["texto"], "ext_importe": imp, "ext_fecha": fila["op"], "cuenta": cuenta, "supuesta": ""}
        if (float(a["importe"]) > 0) != (signo > 0):
            d["importe"] = -float(a["importe"])
            if a.get("participaciones") not in (None, ""): d["participaciones"] = -float(a["participaciones"])
        alm.guardar("aportacion", d, a["id"])
        if not activo: aprender_patron(alm, a["activo"], fila["texto"])
        return True
    return False

def aplicar_en_espera(alm):
    """Las operaciones sin importe que esperaban a su movimiento de la cuenta: si ya está, se le ponen las participaciones."""
    n = 0
    for op in alm.todos("operacion"):
        o = {"fecha": op["fecha"], "isin": "", "texto": op["activo"], "importe": None, "part": abs(float(op["participaciones"])),
             "signo": 1 if float(op["participaciones"]) > 0 else -1}
        cand = [a for a in alm.todos("aportacion") if a["activo"] == op["activo"] and dias(a["fecha"], op["fecha"]) <= DIAS
                and (float(a["importe"]) > 0) == (o["signo"] > 0) and not a.get("orden")
                and (a.get("participaciones") in (None, "") or abs(float(a["participaciones"]) - float(op["participaciones"])) < 1e-6)]
        if not cand: continue
        a = min(cand, key=lambda a: dias(a["fecha"], op["fecha"]))
        alm.guardar("aportacion", {**a, "participaciones": float(op["participaciones"]), "orden": op.get("orden") or ""}, a["id"])
        alm.borrar("operacion", op["id"]); n += 1
    return n

def resolver_conocidos(alm):
    """Las dudas del bróker cuyo texto ya reconoce un activo (p. ej. uno que acaban de crear las órdenes) se guardan solas."""
    from .importar import _resolver_uno
    activos, n = alm.todos("activo"), 0
    for p in alm.todos("pendiente"):
        if p.get("tipo_import") != "inversion": continue
        a = next((a for a in activos if any(C.casa(x, L.norm(p["fila"]["texto"])) for x in a.get("patrones") or [])), None)
        if a: _resolver_uno(alm, p, {"accion": "activo", "activo": a["nombre"]}); n += 1
    return n

# ───────────── importar ─────────────
def importar(alm, ruta, cuenta=None, perfil_nombre=None):
    perfil, ops, descartadas = leer(ruta, alm, perfil_nombre)
    cuentas = alm.todos("cuenta")
    brokers = [c["nombre"] for c in cuentas if c.get("tipo") == "broker"]
    cuenta = cuenta or perfil.get("cuenta") or (brokers[0] if len(brokers) == 1 else None)
    if not cuenta or not any(c["nombre"] == cuenta for c in cuentas):
        from .importar import NecesitaCuenta as NC
        raise NC({"archivo": os.path.basename(ruta), "tipo": "operaciones", "perfil": perfil["nombre"],
                  "cuentas": brokers or [c["nombre"] for c in cuentas]})
    traspasos = deducir_signos(ops)
    n = Counter()
    nuevos_activos = []
    with alm.transaccion():
        for o in ops:
            activo, nuevo = activo_de(alm, o, cuenta)
            if nuevo: nuevos_activos.append(activo)
            r = casar_orden(alm, o, activo, cuenta)
            if r: n[r] += 1; continue
            h = huella(o, activo)
            if o["importe"] is None:  # sin importe: espera a su movimiento de la cuenta
                if not any(x.get("orden") == h for x in alm.todos("operacion")):
                    alm.insertar_crudo("operacion", modelo.limpiar("operacion", {"fecha": o["fecha"], "activo": activo,
                                                                                "participaciones": _part(o, o["signo"]), "orden": h}))
                    n["espera"] += 1
                else: n["existente"] += 1
                continue
            alm.insertar_crudo("aportacion", modelo.limpiar("aportacion", {
                "fecha": o["fecha"], "activo": activo, "importe": o["signo"] * o["importe"], "participaciones": _part(o, o["signo"]),
                "cuenta": cuenta, "orden": h, "supuesta": "si" if o.get("supuesta") else "", "traspaso": "si" if o.get("traspaso") else ""}))
            n["nueva"] += 1
        if not perfil.get("cuenta"): alm.guardar("perfil", {**perfil, "cuenta": cuenta}, perfil["id"])
        n["revisadas"] = resolver_conocidos(alm)
        n["espera"] -= aplicar_en_espera(alm)
    partes = [f"{n['nueva']} operaciones nuevas" if n["nueva"] else "",
              f"{n['completada'] + n['desde_revisar']} ya importadas completadas con sus participaciones" if n["completada"] + n["desde_revisar"] else "",
              f"{traspasos} traspasos entre fondos" if traspasos else "",
              f"{n['revisadas']} de «Por revisar» ya reconocidas" if n["revisadas"] else "",
              f"{n['espera']} esperando al extracto de la cuenta" if n["espera"] > 0 else "",
              f"{n['existente']} ya estaban" if n["existente"] else "",
              f"{descartadas} canceladas o rechazadas" if descartadas else "",
              f"activos nuevos: {', '.join(nuevos_activos)}" if nuevos_activos else ""]
    fechas = [o["fecha"] for o in ops] or ["", ""]
    return {"ok": True, "tipo": "operaciones", "cuenta": cuenta, "perfil": perfil["nombre"], "filas": len(ops) + descartadas,
            "nuevas": n["nueva"], "existentes": n["existente"], "dudas": 0, "desde": min(fechas), "hasta": max(fechas),
            "activos_nuevos": nuevos_activos,
            "mensaje": f"Operaciones ({cuenta}): " + " · ".join(p for p in partes if p)}
