# Bizums: casar lo que te envían con el gasto que pagaste tú.
#
# Quien usa la app envía Bizums para pagar SU PARTE de algo que pagó otro (cena, copas, regalo, gasolina, piso…): es un
# gasto suyo, con la categoría que dice el concepto. Y recibe Bizums cuando pagó él y los demás le devuelven su parte:
# es un «reembolso» y resta de la categoría del gasto original.
#
# Lo difícil es saber de qué gasto es cada Bizum recibido. Pistas, de más a menos fiable:
#   · reparto: varios Bizums iguales el mismo día (o al siguiente) y un gasto tuyo cuyo total ÷ (n o n+1 o n+2) es justo
#     ese importe: 5 Bizums de 19,56 € = Mercadona 97,84 € ÷ 5;
#   · cercano: sin esa cuenta, el gasto compartible más grande del día o el anterior que cubre el Bizum.
# Todo esto es aritmética local: no usa Jev. Jev entra solo cuando esto no decide (jev.py, candidatos()).
import datetime, re
from collections import Counter
from . import clasificar as C

VENTANA = 10          # días hacia atrás en los que se busca el gasto de un reparto
VENTANA_CERCANO = 1   # y para un Bizum suelto
NO_COMPARTIBLES = {"Otros", ""}

def _dia(s):
    return datetime.date.fromisoformat(str(s)[:10])

def tolerancia(imp):
    """Los Bizums se redondean (19,568 → 19,56 o 19,6): hasta un 2 % o 6 céntimos."""
    return max(0.06, 0.02 * imp)

def es_bizum(texto):
    return "bizum" in C.norm(texto or "")

def parte(total, imp, k):
    """¿`imp` es 1/k de `total`?"""
    return k >= 1 and abs(total / k - imp) <= tolerancia(imp)

def iguales(imp, fecha, recibidos, dias=1):
    """Cuántos Bizums recibidos (contando este) valen lo mismo, con `dias` de margen. `recibidos`: [{fecha, importe}]."""
    d = _dia(fecha)
    return sum(1 for b in recibidos if abs(b["importe"] - imp) <= tolerancia(imp) and abs((_dia(b["fecha"]) - d).days) <= dias)

def compartibles(gastos, fijas=()):
    """Gastos que pueden haberse repartido: no fijos, no de las categorías que no se reparten y con categoría conocida."""
    excluidas = set(fijas) | C.NO_COMPARTIDAS | NO_COMPARTIBLES
    return [g for g in gastos if g.get("cat") not in excluidas]

def candidatos(imp, fecha, gastos, recibidos, fijas=(), ventana=VENTANA, maximo=6):
    """Gastos que pueden ser el que reembolsa este Bizum, del más al menos probable:
    [{gasto, dias, k, reparto}] con `k` = entre cuántos se repartiría si la cuenta cuadra (reparto: cuadra con n, n+1 o n+2)."""
    # Los Bizums de un reparto llegan en uno o dos días: se prueba con todos los tamaños entre «los del mismo día» y «±1 día»
    n0, n1 = max(1, iguales(imp, fecha, recibidos, 0)), max(1, iguales(imp, fecha, recibidos, 1))
    n = n1
    d = _dia(fecha)
    out = []
    for g in compartibles(gastos, fijas):
        dias = (d - _dia(g["fecha"])).days
        if not 0 <= dias <= ventana or g["importe"] < imp - tolerancia(imp): continue
        k = next((k for k in range(max(2, n0), n1 + 3) if parte(g["importe"], imp, k)), None)
        if k is None and n == 1: k = next((k for k in (1, 2, 3, 4) if parte(g["importe"], imp, k)), None)
        out.append({"gasto": g, "dias": dias, "k": k, "reparto": k is not None and n >= 2})
    # Primero los que cuadran (los repartos, antes), luego los más cercanos en el tiempo y, a igualdad, los más grandes
    out.sort(key=lambda c: (not c["reparto"], c["k"] is None, c["dias"], -c["gasto"]["importe"]))
    return out[:maximo]

def casar(imp, fecha, gastos, recibidos, fijas=()):
    """El gasto que reembolsa este Bizum: {gasto, dias, k, reparto} o None.
    Con reparto exacto, hasta `VENTANA` días atrás; si no, solo el día o el anterior (el más grande que lo cubre)."""
    cs = candidatos(imp, fecha, gastos, recibidos, fijas)
    if not cs: return None
    if cs[0]["reparto"]: return cs[0]
    cerca = [c for c in cs if c["dias"] <= VENTANA_CERCANO]
    return max(cerca, key=lambda c: c["gasto"]["importe"]) if cerca else None

def repartos(pendientes):
    """Los Bizums recibidos iguales (≥ 2) del mismo día que esperan en «Por revisar» son un solo reparto, de un solo gasto.
    → {id de la duda: clave del reparto} (solo los que forman parte de uno)."""
    bz = sorted((p for p in pendientes if p.get("tipo_import") == "banco" and (p.get("fila") or {}).get("importe", 0) > 0
                 and es_bizum(p["fila"].get("texto")) and p["fila"].get("clase") != "transferencia"),
                key=lambda p: (p["fila"]["op"], p["fila"]["importe"]))
    grupos, out = [], {}
    for p in bz:
        f = p["fila"]
        g = next((g for g in grupos if g[0]["fila"]["op"] == f["op"] and p.get("cuenta") == g[0].get("cuenta")
                  and abs(g[0]["fila"]["importe"] - f["importe"]) <= tolerancia(f["importe"])), None)
        if g: g.append(p)
        else: grupos.append([p])
    for g in grupos:
        if len(g) >= 2:
            for p in g: out[p["id"]] = f"reparto|{g[0]['fila']['op']}|{g[0]['fila']['importe']:.2f}"
    return out

def propagar(filas):
    """Un reparto es un solo gasto: si uno de los Bizums iguales del mismo día ya tiene categoría (porque su concepto dice
    «comida» o porque casó con un gasto), los hermanos sin clasificar la heredan. `filas`: las del extracto, ya clasificadas
    con clasificar_fila. → nº de filas resueltas."""
    n = 0
    bz = [f for f in filas if f["importe"] > 0 and es_bizum(f["texto"]) and f.get("clase") != "transferencia"]
    for f in bz:
        if not f.get("duda"): continue
        d = _dia(f["op"])
        sib = next((g for g in bz if g is not f and not g.get("duda") and g.get("clase") == "reembolso" and g.get("cat")
                    and abs(g["importe"] - f["importe"]) <= tolerancia(f["importe"]) and abs((_dia(g["op"]) - d).days) <= 1), None)
        if not sib: continue
        nombre = (re.search(r"bizum (?:de|recibido de)\s+(\S+)", f["texto"], re.I) or [None, "Bizum"])[1]
        f.update(clase="reembolso", cat=sib["cat"], concepto=f"Parte de {C.titulo(nombre)}", aprendido=False)
        f.pop("duda", None)
        n += 1
    return n

# ───────────── lo que ya está guardado ─────────────
def _gasto(m):
    return {"fecha": m["fecha"], "importe": float(m["importe"]), "cat": m.get("categoria") or "", "texto": m.get("ext_texto") or m.get("concepto") or "",
            "concepto": m.get("concepto") or "", "id": m["id"]}

def previos(alm, desde, hasta):
    """Gastos y Bizums recibidos ya guardados que el archivo que se importa no trae (fuera de sus fechas): así un Bizum
    que llega en otro extracto también encuentra su gasto. → {gastos, bizums}."""
    gastos, bizums = [], []
    for m in alm.todos("movimiento"):
        if desde <= m["fecha"] <= hasta: continue  # lo de esas fechas viene en el propio archivo
        if m.get("clase") == "gasto": gastos.append(_gasto(m))
        elif m.get("clase") in ("reembolso", "ingreso") and es_bizum(m.get("ext_texto")): bizums.append({"fecha": m["fecha"], "importe": float(m["importe"])})
    return {"gastos": gastos, "bizums": bizums}

def detalle_candidatos(pendientes, movs, fijas=(), maximo=8):
    """Para «Por revisar»: de cada Bizum recibido que espera, los gastos tuyos que podrían ser el que devuelve, con todo lo que
    ayuda a elegir (qué, cuándo, cuánto, categoría, cuánto te han devuelto ya y si la cuenta cuadra). → {id de la duda: [candidato]}."""
    devuelto = Counter()
    for m in movs:
        if m.get("reembolsa"): devuelto[m["reembolsa"]] += float(m["importe"])
    gastos = [_gasto(m) for m in movs if m.get("clase") == "gasto"]
    esperando = [p for p in pendientes if p.get("tipo_import") == "banco" and (p.get("fila") or {}).get("importe", 0) > 0
                 and es_bizum(p["fila"].get("texto")) and p["fila"].get("clase") != "transferencia"]
    recibidos = [{"fecha": p["fila"]["op"], "importe": p["fila"]["importe"]} for p in esperando] + \
                [{"fecha": m["fecha"], "importe": float(m["importe"])} for m in movs if m.get("clase") in ("reembolso", "ingreso") and es_bizum(m.get("ext_texto"))]
    out = {}
    for p in esperando:
        f = p["fila"]
        cs = candidatos(f["importe"], f["op"], gastos, recibidos, fijas, maximo=maximo)
        out[p["id"]] = [{"id": c["gasto"]["id"], "fecha": c["gasto"]["fecha"], "concepto": c["gasto"]["concepto"], "texto": c["gasto"]["texto"],
                         "importe": c["gasto"]["importe"], "cat": c["gasto"]["cat"], "dias": c["dias"], "k": c["k"], "reparto": c["reparto"],
                         "devuelto": round(devuelto[c["gasto"]["id"]], 2)} for c in cs]
    return out

def enlazar(alm):
    """Une cada Bizum recibido que reembolsa un gasto con ese gasto (`movimiento.reembolsa` = id del gasto). Solo si el gasto
    tiene la misma categoría (así lo que ves y lo que se resta coinciden) y no se devuelve más de lo que costó.
    No toca lo que ya está enlazado (ni lo que enlazaste tú). → nº de enlaces nuevos."""
    movs = alm.todos("movimiento")
    gastos = {m["id"]: m for m in movs if m.get("clase") == "gasto"}
    devuelto = Counter()
    for m in movs:
        if m.get("reembolsa") in gastos: devuelto[m["reembolsa"]] += float(m["importe"])
    recibidos = [m for m in movs if m.get("clase") == "reembolso" and es_bizum(m.get("ext_texto"))]
    cuentas_bizum = [{"fecha": m["fecha"], "importe": float(m["importe"])} for m in recibidos]
    grupos = {c["nombre"]: c.get("grupo") for c in alm.todos("categoria")}
    fijas = {n for n, g in grupos.items() if g == "fijo"}
    n = 0
    for m in sorted(recibidos, key=lambda x: (x["fecha"], x["id"])):
        if m.get("reembolsa") or not m.get("categoria"): continue
        imp = float(m["importe"])
        mismos = [_gasto(g) for g in gastos.values() if g.get("categoria") == m["categoria"] and g["id"] != m["id"]]
        c = casar(imp, m["fecha"], mismos, cuentas_bizum, fijas)
        if not c or devuelto[c["gasto"]["id"]] + imp > c["gasto"]["importe"] + tolerancia(imp): continue
        alm.guardar("movimiento", {**m, "reembolsa": c["gasto"]["id"]}, m["id"])
        devuelto[c["gasto"]["id"]] += imp
        n += 1
    return n
