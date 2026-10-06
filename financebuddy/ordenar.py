# Ordenar lo ya hecho: probar una regla antes de guardarla (y aplicarla a lo ya importado) y fusionar u ocultar categorías.
# Todo con vista previa: primero se cuenta lo que pasaría, y solo después, y con confirmación, se cambia (el servidor deja una foto
# para poder deshacerlo, ver App.manejar).
from . import clasificar as C

CLASES_MOV = ("gasto", "ingreso", "reembolso")

def _entra(clase): return clase in ("ingreso", "reembolso")

def _casan(alm, patron, clase):
    """Movimientos ya importados (con texto del extracto) a los que se aplicaría una regla con este patrón y tipo."""
    if len(C.limpio(patron)) < 2: return []
    out = []
    for m in alm.todos("movimiento"):
        if m.get("clase") not in CLASES_MOV or not m.get("ext_texto") or not C.aplica(patron, m["ext_texto"]): continue
        if clase in CLASES_MOV and _entra(m["clase"]) != _entra(clase): continue  # un gasto no se mezcla con un ingreso
        out.append(m)
    return out

def probar_regla(alm, d):
    """Qué movimientos casarían con la regla {patron, clase, categoria}: recuento, los que cambiarían de categoría y una muestra.
    Las reglas de «entre cuentas» solo se cuentan: se usan al importar, no cambian lo ya importado."""
    patron, clase, cat = str(d.get("patron") or "").strip(), d.get("clase") or "gasto", str(d.get("categoria") or "").strip()
    if len(C.limpio(patron)) < 2: return {"patron": patron, "n": 0, "cambian": 0, "ya": 0, "pendientes": 0, "muestra": [], "aplicable": False, "corto": True}
    if clase == "transferencia":
        ms = [m for m in alm.todos("movimiento") if m.get("ext_texto") and C.aplica(patron, m["ext_texto"])]
        return {"patron": patron, "n": len(ms), "cambian": 0, "ya": 0, "pendientes": _pendientes(alm, patron), "aplicable": False,
                "muestra": [_fila(m) for m in ms[:8]]}
    ms = _casan(alm, patron, clase)
    cambian = [m for m in ms if cat and m.get("categoria") != cat]
    ms.sort(key=lambda m: m.get("fecha") or "", reverse=True); cambian.sort(key=lambda m: m.get("fecha") or "", reverse=True)
    return {"patron": patron, "n": len(ms), "cambian": len(cambian), "ya": len(ms) - len(cambian), "pendientes": _pendientes(alm, patron),
            "muestra": [_fila(m) for m in (cambian or ms)[:8]], "aplicable": bool(cat and cambian)}

def _pendientes(alm, patron):
    return sum(1 for q in alm.todos("pendiente") if q.get("tipo_import") == "banco" and C.aplica(patron, (q.get("fila") or {}).get("texto") or ""))

def _fila(m):
    return {"id": m["id"], "fecha": m.get("fecha"), "texto": m.get("ext_texto") or m.get("concepto"), "importe": m["importe"], "clase": m["clase"], "categoria": m.get("categoria") or ""}

def aplicar_regla(alm, d):
    """Pone la categoría de la regla a los movimientos ya importados que casan. Devuelve un mensaje."""
    r, cat = str(d.get("patron") or "").strip(), str(d.get("categoria") or "").strip()
    if d.get("clase") == "transferencia": raise ValueError("Las reglas de «entre cuentas» solo sirven al importar.")
    if not any(c["nombre"] == cat for c in alm.todos("categoria")): raise ValueError("Elige una categoría.")
    ms = [m for m in _casan(alm, r, d.get("clase") or "gasto") if m.get("categoria") != cat]
    with alm.transaccion():
        for m in ms: alm.guardar("movimiento", {**m, "categoria": cat}, m["id"])
    return f"{len(ms)} movimiento{'s' if len(ms) != 1 else ''} pasado{'s' if len(ms) != 1 else ''} a «{cat}»"

# ───────────── categorías ─────────────
def uso(alm):
    """{categoría: {movimientos, fijos, reglas}} con cuántas veces se usa cada una."""
    out = {c["nombre"]: {"movimientos": 0, "fijos": 0, "reglas": 0} for c in alm.todos("categoria")}
    for tipo, campo in (("movimiento", "movimientos"), ("recurrente", "fijos"), ("regla", "reglas")):
        for r in alm.todos(tipo):
            if r.get("categoria") in out: out[r["categoria"]][campo] += 1
    return out

def _dos(alm, origen, destino):
    cats = {c["nombre"]: c for c in alm.todos("categoria")}
    if origen not in cats or destino not in cats: raise ValueError("Elige las dos categorías.")
    if origen == destino: raise ValueError("Elige dos categorías distintas.")
    if (cats[origen].get("grupo") == "ingreso") != (cats[destino].get("grupo") == "ingreso"):
        raise ValueError("Una es de ingresos y la otra de gastos: no se pueden fusionar.")
    return cats[origen], cats[destino]

def vista_fusion(alm, origen, destino):
    """Lo que pasaría al fusionar `origen` dentro de `destino` (sin tocar nada)."""
    o, d = _dos(alm, origen, destino)
    u = uso(alm)[origen]
    pend = sum(1 for q in alm.todos("pendiente") if ((q.get("jev") or {}).get("categoria")) == origen)
    pres = round((o.get("presupuesto") or 0) + (d.get("presupuesto") or 0), 2)
    return {"ok": True, **u, "pendientes": pend, "presupuesto_origen": o.get("presupuesto") or 0, "presupuesto_destino": d.get("presupuesto") or 0,
            "presupuesto": pres, "grupo_cambia": o.get("grupo") != d.get("grupo")}

def fusionar(alm, origen, destino):
    """Mueve a `destino` los movimientos, fijos, reglas y sugerencias pendientes de `origen`, suma su presupuesto y borra `origen`.
    Se recuerda en config (`categorias_fusionadas`) para que una actualización de la plantilla no la vuelva a crear."""
    o, d = _dos(alm, origen, destino)
    with alm.transaccion():
        n = 0
        for tipo in ("movimiento", "recurrente", "regla"):
            for r in alm.todos(tipo):
                if r.get("categoria") == origen: alm.guardar(tipo, {**r, "categoria": destino}, r["id"]); n += 1 if tipo == "movimiento" else 0
        for q in alm.todos("pendiente"):
            j = q.get("jev")
            if j and j.get("categoria") == origen: alm.guardar("pendiente", {**q, "jev": {**j, "categoria": destino}}, q["id"])
        pres = round((o.get("presupuesto") or 0) + (d.get("presupuesto") or 0), 2)
        alm.guardar("categoria", {**d, **({"presupuesto": pres} if pres else {})}, d["id"])
        alm.borrar("categoria", o["id"])
        f = alm.config("categorias_fusionadas") or {}
        f = {k: (destino if v == origen else v) for k, v in f.items()}; f[origen] = destino
        alm.set_config("categorias_fusionadas", f)
    return f"«{origen}» ahora es «{destino}»" + (f" · {n} movimiento{'s' if n != 1 else ''} movido{'s' if n != 1 else ''}" if n else "")

def ocultar(alm, nombres, ocultar=True):
    """Oculta (o vuelve a enseñar) categorías: dejan de salir al elegir categoría, pero sus movimientos se conservan."""
    cats = {c["nombre"]: c for c in alm.todos("categoria")}
    elegidas = [cats[n] for n in nombres if n in cats and bool(cats[n].get("oculta")) != ocultar]
    with alm.transaccion():
        for c in elegidas: alm.guardar("categoria", {**c, "oculta": ocultar}, c["id"])
    n = len(elegidas)
    return f"{n} categoría{'s' if n != 1 else ''} {'oculta' if ocultar else 'visible'}{'s' if n != 1 else ''}"
