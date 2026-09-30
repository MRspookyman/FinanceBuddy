# Arreglos de la cartera a mano, para cuando lo importado no cuadra con lo que dice tu bróker:
# unir dos activos que son el mismo, deshacer un activo que en realidad era dinero traspasado desde tu banco,
# borrar un activo con sus operaciones y cuadrar las participaciones (ajuste).
# Lo que venía de un extracto y se borra queda como «ignorado»: al volver a importar ese extracto no reaparece.
import datetime
from . import clasificar as C, lectura as L, modelo

def _activo(alm, id):
    a = alm.obtener("activo", int(id))
    if not a: raise ValueError("Ese activo ya no existe.")
    return a

def _ignorar_extracto(alm, ap):
    """La fila del extracto de la que salía esta operación no se vuelve a importar."""
    if ap.get("ext_fecha"):
        alm.insertar_crudo("ignorado", {"cuenta": ap.get("cuenta", ""), "ext_fecha": ap["ext_fecha"],
                                        "ext_importe": ap.get("ext_importe"), "ext_texto": ap.get("ext_texto", "")})

def unir(alm, origen_id, destino_id):
    """Pasa todo lo de `origen` a `destino` (operaciones, aportaciones periódicas, valores anotados, patrones) y borra `origen`."""
    o, d = _activo(alm, origen_id), _activo(alm, destino_id)
    if o["id"] == d["id"]: raise ValueError("Elige otro activo.")
    with alm.transaccion():
        for tipo, campo in (("aportacion", "activo"), ("operacion", "activo"), ("recurrente", "activo_inversion")):
            for r in alm.todos(tipo):
                if r.get(campo) == o["nombre"]: alm.guardar(tipo, {**r, campo: d["nombre"]}, r["id"])
        for r in alm.todos("patrimonio"):
            v = dict(r.get("valores") or {})
            if o["nombre"] in v:
                v[d["nombre"]] = round(float(v.get(d["nombre"]) or 0) + float(v.pop(o["nombre"]) or 0), 2)
                alm.guardar("patrimonio", {**r, "valores": v}, r["id"])
        patrones = list(dict.fromkeys((d.get("patrones") or []) + (o.get("patrones") or []) + [L.norm(o["nombre"])]))
        cambios = {"patrones": patrones, "isin": d.get("isin") or o.get("isin") or ""}
        if o.get("aportado_inicial"): cambios["aportado_inicial"] = round(float(d.get("aportado_inicial") or 0) + float(o["aportado_inicial"]), 2)
        inicios = [x for x in (d.get("fecha_inicio"), o.get("fecha_inicio")) if x]
        if inicios: cambios["fecha_inicio"] = min(inicios)
        if d.get("valor") is None and o.get("valor") is not None: cambios.update(valor=o["valor"], fecha_valor=o.get("fecha_valor"))
        alm.borrar("activo", o["id"])
        alm.guardar("activo", {**d, **cambios}, d["id"])
    return f"«{o['nombre']}» unido a «{d['nombre']}»"

def borrar(alm, id, era_traspaso=False):
    """Borra el activo y sus operaciones. Con `era_traspaso`, además se recuerda que ese texto del extracto es dinero
    que entra desde tu banco (no una venta): la próxima vez se ignora solo."""
    a = _activo(alm, id)
    with alm.transaccion():
        ops = [x for x in alm.todos("aportacion") if x.get("activo") == a["nombre"]]
        for x in ops:
            _ignorar_extracto(alm, x)
            alm.borrar("aportacion", x["id"])
        for x in alm.todos("operacion"):
            if x.get("activo") == a["nombre"]: alm.borrar("operacion", x["id"])
        if era_traspaso:
            for x in ops:
                if not x.get("ext_texto"): continue
                patron = C.patron_sugerido(x["ext_texto"])
                perfil = next((p for p in alm.todos("perfil") if p.get("tipo") == "inversion" and (p.get("cuenta") in ("", None, x.get("cuenta")))), None)
                if perfil and patron and not any(ac.get("patron") == patron for ac in perfil.get("acciones") or []):
                    alm.guardar("perfil", {**perfil, "acciones": (perfil.get("acciones") or []) + [{"patron": patron, "accion": "ignorar"}]}, perfil["id"])
        alm.borrar("activo", a["id"])
    que = "Traspaso desde tu banco: " if era_traspaso else "Borrado: "
    return f"{que}«{a['nombre']}» y {len(ops)} operaci{'ón' if len(ops) == 1 else 'ones'}"

def participaciones(alm, nombre):
    return round(sum(float(x.get("participaciones") or 0) for x in alm.todos("aportacion") if x.get("activo") == nombre), 6)

def cuadrar(alm, id, objetivo, fecha=None, valor=None):
    """Tu bróker dice que tienes `objetivo` participaciones: se añade un ajuste con la diferencia (sin dinero), para que
    las cuentas de la app (participaciones, precio medio) salgan como en el bróker. Con `valor`, también se anota lo que vale."""
    a = _activo(alm, id)
    objetivo = modelo.numero(objetivo, 6)
    if objetivo is None or objetivo < 0: raise ValueError("Escribe las participaciones que te dice tu bróker.")
    fecha = modelo.fecha(fecha) or datetime.date.today().isoformat()
    actual = participaciones(alm, a["nombre"])
    dif = round(objetivo - actual, 6)
    with alm.transaccion():
        if abs(dif) > 1e-9:
            alm.guardar("aportacion", {"fecha": fecha, "activo": a["nombre"], "importe": 0, "participaciones": dif, "cuenta": a.get("cuenta", ""),
                                       "ajuste": "si", "nota": f"Cuadrar con el bróker: tenía {actual:g}, el bróker dice {objetivo:g}"})
        v = modelo.numero(valor)
        if v is not None: alm.guardar("activo", {**a, "valor": v, "fecha_valor": fecha}, a["id"])
    partes = [f"ajuste de {'+' if dif > 0 else ''}{dif:g} participaciones" if abs(dif) > 1e-9 else "ya cuadraba"]
    if valor not in (None, ""): partes.append("valor anotado")
    return f"{a['nombre']}: " + " · ".join(partes)
