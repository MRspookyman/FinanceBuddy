# Importación de extractos: banco (movimientos) e inversión (compras/ventas de activos e intereses).
#
# Flujo de un archivo: reconocer su formato (perfil) → leer las filas → (banco) comprobar la cadena de saldos →
# clasificar → descartar lo ya importado (huella del extracto) → guardar lo claro y dejar lo dudoso «por revisar».
# Si el formato no se reconoce, devuelve lo necesario para que el usuario diga qué columna es cada cosa.
import datetime, os, re, shutil
from collections import Counter
from . import bizums, clasificar as C, lectura as L, modelo, operaciones as OP

class NecesitaPerfil(Exception):
    def __init__(self, info): super().__init__("formato desconocido"); self.info = info

class NecesitaCuenta(Exception):
    def __init__(self, info): super().__init__("falta la cuenta"); self.info = info

EXTENSIONES = (".xlsx", ".xls", ".xlsm", ".csv", ".txt")

# ───────────── lectura con perfil ─────────────
def leer(ruta, alm, tipo=None, perfil_nombre=None, info=None):
    """→ (perfil, filas normalizadas). tipo: banco | inversion | None (se deduce del formato).
    info (dict): se rellena con lo que dice la cabecera del archivo (iban, titular)."""
    crudas = L.filas_crudas(ruta)
    perfiles = alm.todos("perfil")
    if perfil_nombre: perfiles = [p for p in perfiles if p["nombre"] == perfil_nombre]
    rec = L.reconocer(crudas, perfiles, tipo)
    if not rec:
        raise NecesitaPerfil({"archivo": os.path.basename(ruta), "tipo": tipo, **L.muestra_para_configurar(crudas)})
    perfil, i, idx = rec
    if info is not None: info.update(L.datos_cabecera(crudas[:i]))
    filas = []
    for f in crudas[i + 1:]:
        cel = lambda k: f[idx[k]] if k in idx and idx[k] < len(f) else None
        op = L.fecha(cel("fecha"))
        if not op: continue
        if "importe" in idx: imp = L.numero(cel("importe"))
        else:
            cargo, abono = L.numero(cel("cargo")), L.numero(cel("abono"))
            imp = None if cargo is None and abono is None else (abono or 0) - abs(cargo or 0)
        if imp is None: continue
        texto = L.texto(cel("concepto")) or "Movimiento"
        fila = {"op": op, "texto": texto, "importe": round(imp, 2)}
        if "categoria" in idx and L.texto(cel("categoria")): fila["cat_archivo"] = L.texto(cel("categoria"))  # la plantilla de FinanceBuddy
        val = L.fecha(cel("fecha_valor")) if "fecha_valor" in idx else None
        if val: fila["val"] = val
        if "saldo" in idx:
            s = L.numero(cel("saldo"))
            if s is not None: fila["saldo"] = round(s, 2)
        filas.append(fila)
    if not filas: raise ValueError("El archivo no tiene movimientos (o las columnas elegidas no son las correctas).")
    return perfil, filas

def categoria_del_archivo(f, grupos):
    """La plantilla de FinanceBuddy trae la categoría que el usuario eligió en un desplegable con SUS categorías: manda sobre las
    reglas, salvo en un traspaso entre sus cuentas. Solo vale una categoría que exista (lista cerrada) y que encaje con el
    signo: un gasto en una categoría de ingresos se deja a las reglas. Un importe positivo en una categoría de gasto es un reembolso."""
    cat = next((n for n in grupos if C.norm(n) == C.norm(f.get("cat_archivo") or "")), None)
    if not cat or f.get("clase") == "transferencia" or not f["importe"]: return
    es_ingreso = grupos[cat] == "ingreso"
    if f["importe"] < 0 and es_ingreso: return
    f.update(clase="gasto" if f["importe"] < 0 else "ingreso" if es_ingreso else "reembolso", cat=cat, aprendido=False)
    f.pop("duda", None)

def ordenar_y_comprobar_saldos(filas):
    """Deja las filas de la más reciente a la más antigua y comprueba la cadena de saldos (si el archivo los trae).
    Devuelve (filas, error o None)."""
    if filas[0]["op"] < filas[-1]["op"]: filas = list(reversed(filas))
    con_saldo = all("saldo" in f for f in filas)
    if not con_saldo:
        for f in filas: f.pop("saldo", None)
        return filas, None
    def roto(fs):
        for i in range(len(fs) - 1):
            a, b = fs[i], fs[i + 1]
            if abs(b["saldo"] + a["importe"] - a["saldo"]) > 0.005: return i
        return None
    i = roto(filas)
    if i is None: return filas, None
    if roto(list(reversed(filas))) is None and filas[0]["op"] == filas[-1]["op"]: return list(reversed(filas)), None
    a = filas[i]
    return filas, (f"Los saldos del archivo no cuadran en el movimiento del {fmt(a['op'])} «{a['texto'][:50]}» ({a['importe']:+.2f} €). "
                   "Puede que falten filas o que las columnas de importe y saldo no sean las correctas. No se ha importado nada.")

def fmt(iso): return "/".join(reversed(iso.split("-")))

# ───────────── duplicados ─────────────
def huellas_existentes(alm, cuenta, tipo_reg="movimiento"):
    """Filas de extracto ya presentes en la base de datos (importadas, pendientes de revisar o descartadas).
    Cada movimiento con huella cuenta como una fila, salvo las partes de una fila dividida (su importe no coincide
    con el del extracto), que cuentan una vez entre todas. Así dos movimientos idénticos el mismo día cuentan dos."""
    huellas, partidas = Counter(), set()
    for r in alm.todos(tipo_reg):
        if r.get("cuenta", cuenta) != cuenta or not r.get("ext_fecha"): continue
        k = (r["ext_fecha"], round(float(r.get("ext_importe") or 0), 2))
        if tipo_reg == "movimiento" and abs(abs(k[1]) - float(r.get("importe") or 0)) >= 0.005:
            partidas.add((*k, r.get("parte_de") or L.norm(r.get("ext_texto", ""))))  # dos cargos iguales divididos son dos filas
        else: huellas[k] += 1
    for op, imp, _ in partidas: huellas[(op, imp)] += 1
    for r in alm.todos("pendiente") + alm.todos("ignorado"):
        fila = r.get("fila") or r
        if r.get("cuenta") != cuenta: continue
        op = fila.get("op") or r.get("ext_fecha")
        imp = fila.get("importe") if "importe" in fila and r.get("fila") else r.get("ext_importe")
        if op is not None and imp is not None: huellas[(op, round(float(imp), 2))] += 1
    return huellas

# ───────────── banco ─────────────
def cuenta_por_iban(cuentas, iban):
    return next((c["nombre"] for c in cuentas if iban and str(c.get("iban") or "")[-4:] == iban), None)

def recordar_cabecera(alm, info, cuenta):
    """La primera vez: guarda las 4 últimas cifras del IBAN en la cuenta y el titular en la configuración."""
    c = next((x for x in alm.todos("cuenta") if x["nombre"] == cuenta), None)
    if c and info.get("iban") and not c.get("iban"): alm.guardar("cuenta", {**c, "iban": info["iban"]}, c["id"])
    tit = alm.config("titulares") or []
    if info.get("titular") and not any(C.palabras(t) == C.palabras(info["titular"]) for t in tit):
        alm.set_config("titulares", tit + [info["titular"]])

def importar_banco(alm, ruta, cuenta=None, perfil_nombre=None):
    info = {}
    perfil, filas = leer(ruta, alm, "banco", perfil_nombre, info)
    cuentas = alm.todos("cuenta")
    # La cuenta: la elegida, la del IBAN del archivo o la que recuerda el formato (si no es de otro IBAN)
    por_iban = cuenta_por_iban(cuentas, info.get("iban"))
    del_perfil = perfil.get("cuenta")
    otro_iban = info.get("iban") and next((str(c.get("iban") or "") for c in cuentas if c["nombre"] == del_perfil and c.get("iban")), "") not in ("", info.get("iban"))
    cuenta = cuenta or por_iban or (None if otro_iban else del_perfil)
    if not cuenta or not any(c["nombre"] == cuenta for c in cuentas):
        raise NecesitaCuenta({"archivo": os.path.basename(ruta), "tipo": "banco", "perfil": perfil["nombre"],
                              "cuentas": [c["nombre"] for c in cuentas if c.get("tipo") != "broker"]})
    filas, error = ordenar_y_comprobar_saldos(filas)
    if error: return {"ok": False, "mensaje": error}
    reglas = C.ordenar_reglas(alm.todos("regla"))
    recs = alm.todos("recurrente")
    mem = C.memoria(alm.todos("movimiento"))
    grupos = {c["nombre"]: c.get("grupo") for c in alm.todos("categoria")}
    titulares = C.titulares_de((alm.config("titulares") or []) + [info.get("titular")])
    # Clasificar de la más antigua a la más reciente (los Bizums recibidos miran los gastos de antes, también los de otros extractos)
    previos = bizums.previos(alm, min(f["op"] for f in filas), max(f["op"] for f in filas))
    for f in reversed(filas):
        f.update(C.clasificar_fila(f, filas, reglas, cuentas, recs, cuenta, categorias=grupos, mem=mem, titulares=titulares, previos=previos))
    for f in filas: categoria_del_archivo(f, grupos)
    bizums.propagar(filas)  # los hermanos de un reparto heredan la categoría del que ya la tiene
    sugeridas = guardar_sugeridos(alm, filas, mem)  # lo dudoso con categoría sugerida fiable se guarda ya, marcado «por confirmar»
    huellas = huellas_existentes(alm, cuenta)
    # Movimientos apuntados a mano (sin huella) en esa cuenta: mismo importe y sentido, fecha a ±3 días (el banco
    # suele cargarlo un par de días después). Al casar, el apunte manual se queda con la huella del extracto.
    manuales = [m for m in alm.todos("movimiento") if not m.get("ext_fecha") and m.get("cuenta", cuenta) in (cuenta, "", None)]
    def manual_para(f):
        fecha = datetime.date.fromisoformat(min(f["op"], f.get("val") or f["op"]))
        entra = f["importe"] > 0
        cand = [m for m in manuales if abs(float(m["importe"]) - abs(f["importe"])) < 0.005
                and (m["clase"] == "transferencia" or (m["clase"] in ("ingreso", "reembolso")) == entra)
                and abs((datetime.date.fromisoformat(m["fecha"]) - fecha).days) <= 3]
        return min(cand, key=lambda m: abs((datetime.date.fromisoformat(m["fecha"]) - fecha).days)) if cand else None
    nuevas, dudas, existentes, casadas = [], [], 0, []
    for f in reversed(filas):
        k = (f["op"], round(f["importe"], 2))
        if huellas[k] > 0: huellas[k] -= 1; existentes += 1; continue
        m = manual_para(f)
        if m: manuales.remove(m); casadas.append((m, f)); existentes += 1; continue
        (dudas if f.get("duda") else nuevas).append(f)
    with alm.transaccion():
        for m, f in casadas: alm.guardar("movimiento", {**m, "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"]}, m["id"])
        for f in nuevas: alm.insertar_crudo("movimiento", movimiento_de(f, cuenta))
        for f in dudas:
            f.setdefault("patron", C.patron_sugerido(f["texto"]))
            alm.insertar_crudo("pendiente", {"tipo_import": "banco", "cuenta": cuenta, "archivo": os.path.basename(ruta),
                                             "perfil": perfil["nombre"], "fila": f, "duda": f.get("duda", "")})
        if "saldo" in filas[0]:
            prev = alm.config(f"saldo_extracto:{cuenta}") or {}
            if filas[0]["op"] >= prev.get("fecha", ""): alm.set_config(f"saldo_extracto:{cuenta}", {"fecha": filas[0]["op"], "saldo": filas[0]["saldo"]})
        if not perfil.get("cuenta"):  # recordar la cuenta de este formato
            alm.guardar("perfil", {**perfil, "cuenta": cuenta}, perfil["id"])
        recordar_cabecera(alm, info, cuenta)
    aprendidas = sum(1 for f in nuevas if f.get("aprendido"))
    return {"ok": True, "tipo": "banco", "cuenta": cuenta, "perfil": perfil["nombre"], "filas": len(filas), "nuevas": len(nuevas),
            "existentes": existentes, "dudas": len(dudas), "aprendidas": aprendidas, "sugeridas": sugeridas, "desde": filas[-1]["op"], "hasta": filas[0]["op"],
            "mensaje": f"{cuenta}: {len(nuevas)} movimientos nuevos" + (f" ({aprendidas} clasificados por lo que ya sabía de ti)" if aprendidas else "")
                       + (f", {sugeridas} con categoría sugerida por confirmar" if sugeridas else "")
                       + (f", {len(dudas)} por revisar" if dudas else "")
                       + (f" ({existentes} ya estaban)" if existentes else "") + f" · del {fmt(filas[-1]['op'])} al {fmt(filas[0]['op'])}"}

def guardar_sugeridos(alm, filas, mem):
    """Ajuste «Guardar ya lo importado con la categoría sugerida» (config guardar_sugeridos, encendido de serie): las filas con duda
    para las que tu historial propone una categoría con confianza ≥ umbral (config sugeridos_umbral) dejan de ser duda y llevan
    `sugerido` (el motivo). Traspasos y repartos de Bizums se siguen preguntando. → nº de filas."""
    if alm.config("guardar_sugeridos") is False: return 0
    umbral, n = C.umbral_valido(alm.config("sugeridos_umbral") if alm.config("sugeridos_umbral") is not None else C.UMBRAL_SUGERIDO), 0
    for f in filas:
        if not f.get("duda") or f.get("clase") == "transferencia" or "reparto" in f["duda"]: continue
        s = C.sugerir_guardable(f["texto"], f["importe"], mem, umbral)
        if not s: continue
        f.update(clase=s["clase"], cat=s["categoria"], sugerido=f"{s['motivo']} · {round(100 * s['confianza'])} %", aprendido=False)
        f.pop("duda", None); n += 1
    return n

def movimiento_de(f, cuenta, **cambios):
    """Fila del extracto ya clasificada → registro de movimiento (validado)."""
    f = {**f, **cambios}
    d = {"fecha": min(f["op"], f.get("val") or f["op"]), "clase": f["clase"], "categoria": f.get("cat") if f["clase"] != "transferencia" else "",
         "importe": abs(f["importe"]), "cuenta": cuenta, "concepto": f.get("concepto") or C.titulo(f["texto"]),
         "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"]}
    for k in ("recurrente", "destino", "origen", "reembolsa", "sugerido"):
        if f.get(k): d[k] = f[k]
    return modelo.limpiar("movimiento", d)

# ───────────── inversión ─────────────
def importar_inversion(alm, ruta, cuenta=None, perfil_nombre=None):
    info = {}
    perfil, filas = leer(ruta, alm, "inversion", perfil_nombre, info)
    cuentas = alm.todos("cuenta")
    brokers = [c["nombre"] for c in cuentas if c.get("tipo") == "broker"]
    cuenta = cuenta or cuenta_por_iban(cuentas, info.get("iban")) or perfil.get("cuenta") or (brokers[0] if len(brokers) == 1 else None)
    if not cuenta or not any(c["nombre"] == cuenta for c in cuentas):
        raise NecesitaCuenta({"archivo": os.path.basename(ruta), "tipo": "inversion", "perfil": perfil["nombre"],
                              "cuentas": [c["nombre"] for c in cuentas if c.get("tipo") == "broker"]})
    activos = [a for a in alm.todos("activo")]
    acciones = perfil.get("acciones") or []
    signo = -1 if perfil.get("compras_negativas", True) else 1
    huellas_ap = huellas_existentes(alm, cuenta, "aportacion")
    huellas_mov = huellas_existentes(alm, cuenta, "movimiento")
    huellas_cobro = huellas_existentes(alm, cuenta, "cobro")
    nuevos_cobro = []
    # Aportaciones registradas a mano (sin huella): misma fecha, importe y activo
    manuales = Counter((a["fecha"], round(float(a["importe"]), 2), a["activo"]) for a in alm.todos("aportacion") if not a.get("ext_fecha"))
    recs = [r for r in alm.todos("recurrente") if r.get("clase") == "aportacion"]
    nuevas_ap, nuevos_mov, dudas, existentes, ignoradas = [], [], [], 0, 0
    for f in sorted(filas, key=lambda x: x["op"]):
        k = (f["op"], round(f["importe"], 2))
        tn = L.norm(f["texto"])
        activo = next((a for a in activos if any(C.casa(p, tn) for p in a.get("patrones") or [])), None)
        accion = next((x["accion"] for x in acciones if C.casa(x.get("patron", ""), tn)), None)
        if activo and f["importe"] > 0 and RE_DIVIDENDO.search(tn):  # un dividendo de un activo conocido: no es una venta
            if huellas_cobro[k] > 0: huellas_cobro[k] -= 1; existentes += 1; continue
            nuevos_cobro.append(modelo.limpiar("cobro", {"fecha": f["op"], "activo": activo["nombre"], "tipo": "dividendo", "importe": abs(f["importe"]), "cuenta": cuenta,
                                                         "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"]}))
        elif activo:
            imp = round(signo * f["importe"], 2)
            if huellas_ap[k] > 0: huellas_ap[k] -= 1; existentes += 1; continue
            km = (f["op"], imp, activo["nombre"])
            if manuales[km] > 0: manuales[km] -= 1; existentes += 1; continue
            if OP.casar_movimiento(alm, f, cuenta, activo["nombre"], signo): existentes += 1; continue  # ya vino en el archivo de órdenes
            d = {"fecha": f["op"], "activo": activo["nombre"], "importe": imp, "cuenta": cuenta, "participaciones": participaciones(f["texto"], imp),
                 "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"]}
            rec = next((r for r in recs if r.get("activo_inversion") == activo["nombre"] and r.get("activo") is not False
                        and (r.get("desde") or "") <= f["op"] and imp > 0 and abs(imp - float(r.get("importe") or 0)) <= max(10, 0.05 * float(r.get("importe") or 0))), None)
            if rec: d["recurrente"] = rec["nombre"]
            nuevas_ap.append(modelo.limpiar("aportacion", d))
        elif accion == "interes":
            if huellas_mov[k] > 0: huellas_mov[k] -= 1; existentes += 1; continue
            nuevos_mov.append(modelo.limpiar("movimiento", {"fecha": f["op"], "clase": "ingreso" if f["importe"] > 0 else "gasto",
                "categoria": cat_intereses(alm) if f["importe"] > 0 else "Comisiones", "importe": abs(f["importe"]), "cuenta": cuenta,
                "concepto": f"Intereses {cuenta}" if f["importe"] > 0 else f"Comisión {cuenta}", "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"]}))
        elif accion == "ignorar":
            ignoradas += 1
        else:
            hk = (f["op"], round(f["importe"], 2))
            ya = huellas_mov[hk] > 0 or huellas_ap[hk] > 0
            if ya:
                (huellas_mov if huellas_mov[hk] > 0 else huellas_ap)[hk] -= 1; existentes += 1; continue
            if OP.casar_movimiento(alm, f, cuenta, None, signo): existentes += 1; continue  # una orden ya importada (activo por su ISIN)
            duda = ("Entrada de dinero: ¿es un traspaso desde tu banco (se ignora aquí), intereses o la venta de un activo?" if f["importe"] > 0
                    else "Salida de dinero: ¿es la compra de un activo (¿cuál?), una comisión o un traspaso a tu banco?")
            dudas.append({**f, "patron": C.patron_sugerido(f["texto"]), "duda": duda})
    with alm.transaccion():
        for d in nuevas_ap: alm.insertar_crudo("aportacion", d)
        for d in nuevos_mov: alm.insertar_crudo("movimiento", d)
        for d in nuevos_cobro: alm.insertar_crudo("cobro", d)
        for f in dudas:
            alm.insertar_crudo("pendiente", {"tipo_import": "inversion", "cuenta": cuenta, "archivo": os.path.basename(ruta),
                                             "perfil": perfil["nombre"], "fila": f, "duda": f["duda"]})
        if not perfil.get("cuenta"): alm.guardar("perfil", {**perfil, "cuenta": cuenta}, perfil["id"])
        recordar_cabecera(alm, info, cuenta)
        con_titulos = OP.aplicar_en_espera(alm)
    n = len(nuevas_ap) + len(nuevos_mov) + len(nuevos_cobro)
    ops = sorted(f["op"] for f in filas)
    return {"ok": True, "tipo": "inversion", "cuenta": cuenta, "perfil": perfil["nombre"], "filas": len(filas), "nuevas": n,
            "existentes": existentes, "dudas": len(dudas), "desde": ops[0], "hasta": ops[-1],
            "mensaje": f"{cuenta}: {len(nuevas_ap)} compras/ventas y {len(nuevos_mov)} intereses nuevos" + (f", {len(nuevos_cobro)} dividendos" if nuevos_cobro else "") + (f", {len(dudas)} por revisar" if dudas else "")
                       + (f" ({existentes} ya estaban)" if existentes else "") + (f" · {ignoradas} traspasos ignorados" if ignoradas else "")
                       + (f" · {con_titulos} completadas con sus títulos" if con_titulos else "")}

def cat_intereses(alm):
    return "Intereses" if any(c["nombre"] == "Intereses" for c in alm.todos("categoria")) else "Otros ingresos"

# ───────────── traspasos entre tus cuentas (cruce de extractos) ─────────────
RE_TRASPASO = re.compile(r"transferencia|traspaso|ahorro|a favor de|inversi|aportaci")
RE_DIVIDENDO = re.compile(r"dividend|cupon|coupon")

def emparejar_traspasos(alm, dias=3):
    """El mismo dinero visto desde las dos cuentas (sale de una y entra en otra, mismo importe, ±`dias`) es un traspaso.
    Resuelve las dudas de ambos lados: la del banco queda como traspaso a/desde la otra cuenta; la del bróker se descarta
    (la entrada ya la cuenta el traspaso del banco). También una entrada del bróker que ya tiene su traspaso en el banco.
    Devuelve cuántos traspasos ha reconocido."""
    cuentas = {c["nombre"]: c for c in alm.todos("cuenta")}
    pend = [p for p in alm.todos("pendiente") if p.get("cuenta") in cuentas]
    def candidata(p):
        f = p["fila"]
        return p["tipo_import"] == "inversion" or f.get("clase") == "transferencia" or RE_TRASPASO.search(L.norm(f["texto"]))
    pend = [p for p in pend if candidata(p)]
    fecha = lambda p: datetime.date.fromisoformat(p["fila"]["op"])
    usados, n = set(), 0
    with alm.transaccion():
        for p in sorted(pend, key=lambda p: (p["tipo_import"] == "inversion", p["fila"]["op"])):
            if p["id"] in usados or p["tipo_import"] != "banco": continue
            imp = round(p["fila"]["importe"], 2)
            pareja = [q for q in pend if q["id"] not in usados and q["id"] != p["id"] and q["cuenta"] != p["cuenta"]
                      and abs(round(q["fila"]["importe"], 2) + imp) < 0.005 and abs((fecha(q) - fecha(p)).days) <= dias]
            if not pareja: continue
            q = min(pareja, key=lambda q: (abs((fecha(q) - fecha(p)).days), q["tipo_import"] != "inversion"))
            _resolver_uno(alm, p, {"accion": "guardar", "clase": "transferencia", "cuenta_otra": q["cuenta"]})
            if q["tipo_import"] == "inversion": _resolver_uno(alm, q, {"accion": "ignorar"})
            else: _resolver_uno(alm, q, {"accion": "guardar", "clase": "transferencia", "cuenta_otra": p["cuenta"]})
            usados |= {p["id"], q["id"]}; n += 1
        # Entradas/salidas del bróker cuyo traspaso ya está registrado en el banco
        traspasos = [m for m in alm.todos("movimiento") if m.get("clase") == "transferencia" and (m.get("destino") or m.get("origen"))]
        for q in pend:
            if q["id"] in usados or q["tipo_import"] != "inversion": continue
            imp = q["fila"]["importe"]
            ok = next((m for m in traspasos if (m.get("destino") if imp > 0 else m.get("origen")) == q["cuenta"]
                       and abs(float(m["importe"]) - abs(imp)) < 0.005 and abs((datetime.date.fromisoformat(m["fecha"]) - fecha(q)).days) <= dias), None)
            if ok:
                traspasos.remove(ok); _resolver_uno(alm, q, {"accion": "ignorar"}); usados.add(q["id"]); n += 1
    return n

# ───────────── un archivo cualquiera ─────────────
def tipo_de(ruta, alm, carpeta):
    """banco | inversion | operaciones según la carpeta en la que está (en Inversión, las órdenes se reconocen por su
    formato); si está en la raíz de Importar, según el formato."""
    d = os.path.dirname(os.path.abspath(ruta))
    if d == os.path.abspath(carpeta.banco): return "banco"
    perfiles = alm.todos("perfil")
    if d == os.path.abspath(carpeta.inversion):
        return "operaciones" if L.reconocer(L.filas_crudas(ruta), perfiles, "operaciones") else "inversion"
    rec = L.reconocer(L.filas_crudas(ruta), perfiles)
    return rec[0]["tipo"] if rec else None

def importar_archivo(alm, carpeta, ruta, tipo=None, cuenta=None, perfil_nombre=None, simulando=False):
    """Importa un archivo y, si va bien, lo mueve a Importar\\Procesados. Lanza NecesitaPerfil / NecesitaCuenta.
    simulando: dentro de alm.simular() (vista previa): ni copia de seguridad ni mover el archivo."""
    if tipo == "inversion" and L.reconocer(L.filas_crudas(ruta), alm.todos("perfil"), "operaciones"): tipo = "operaciones"
    tipo = tipo or tipo_de(ruta, alm, carpeta)
    if tipo is None:
        raise NecesitaPerfil({"archivo": os.path.basename(ruta), "tipo": None, **L.muestra_para_configurar(L.filas_crudas(ruta))})
    if not simulando: alm.copia(carpeta.copias, extra=alm.config("copia_extra"))
    r = {"banco": importar_banco, "inversion": importar_inversion, "operaciones": OP.importar}[tipo](alm, ruta, cuenta, perfil_nombre)
    if r.get("ok") and r.get("tipo") != "operaciones":
        t = emparejar_traspasos(alm)
        if t:
            antes = r.get("dudas", 0)
            r["traspasos"] = t
            r["dudas"] = sum(1 for p in alm.todos("pendiente") if p.get("archivo") == os.path.basename(ruta) and p.get("cuenta") == r.get("cuenta"))
            if antes: r["mensaje"] = r["mensaje"].replace(f", {antes} por revisar", f", {r['dudas']} por revisar" if r["dudas"] else "")
            r["mensaje"] += f" · {t} traspaso{'s' if t > 1 else ''} entre tus cuentas reconocido{'s' if t > 1 else ''}"
    if r.get("ok") and not simulando:
        destino = os.path.join(carpeta.procesados, f"{datetime.date.today().isoformat()} {os.path.basename(ruta)}")
        n = 2
        while os.path.exists(destino):
            base, ext = os.path.splitext(os.path.basename(ruta))
            destino = os.path.join(carpeta.procesados, f"{datetime.date.today().isoformat()} {base} ({n}){ext}"); n += 1
        try: shutil.move(ruta, destino)
        except OSError: pass
    return r

def archivos_pendientes(carpeta):
    out = []
    for tipo, d in (("banco", carpeta.banco), ("inversion", carpeta.inversion), (None, carpeta.importar)):
        for n in sorted(os.listdir(d)):
            p = os.path.join(d, n)
            if os.path.isfile(p) and n.lower().endswith(EXTENSIONES) and not n.startswith("~$"): out.append((p, tipo))
    return out

# ───────────── configurar un formato nuevo ─────────────
def crear_perfil(alm, nombre, tipo, columnas, cuenta=None, compras_negativas=True):
    """columnas: {campo: texto de la cabecera tal cual aparece}. Campos: fecha, concepto, importe | cargo+abono, [fecha_valor, saldo]."""
    col = {k: L.norm(v) for k, v in columnas.items() if v}
    if "fecha" not in col or "concepto" not in col: raise ValueError("Elige al menos la columna de la fecha y la del concepto.")
    if "importe" not in col and not ("cargo" in col and "abono" in col): raise ValueError("Elige la columna del importe (o las de cargo y abono).")
    existente = next((p for p in alm.todos("perfil") if p["nombre"].lower() == nombre.lower()), None)
    datos = {"nombre": nombre, "tipo": tipo, "columnas": col, "cuenta": cuenta or "", "compras_negativas": compras_negativas}
    return alm.guardar("perfil", {**(existente or {}), **datos}, existente["id"] if existente else None)

# ───────────── activos nuevos desde el extracto del bróker ─────────────
def participaciones(texto, importe):
    """«ETF ETFS Copper ETC @ 2» → 2 (con el signo de la operación: + compra, − venta). None si el texto no las dice."""
    m = re.search(r"@\s*(\d+(?:[.,]\d+)?)\s*$", str(texto))
    if not m: return None
    n = float(m.group(1).replace(",", "."))
    return n if importe >= 0 else -n

def clase_activo(texto):
    t = L.norm(texto)
    if re.search(r"bitcoin|\bbtc\b|ethereum|crypto|cripto|solana", t): return "cripto"
    if re.search(r"\bgold\b|\boro\b|silver|\bplata\b|copper|cobre|commodit|materias primas|platinum|petroleo|\boil\b", t): return "materia"
    if re.search(r"\betf\b|\betc\b|\betp\b|ishares|xtrackers|physical|lyxor|spdr", t): return "etf"
    if re.search(r"\bindex\b|\bfund\b|fondo|\bacc\b|\bfi\b|\bclase\b", t): return "fondo"
    return "otro"

def nombre_activo(texto):
    """«FIDELITY PHYSICAL BITCOIN ET @» → «Fidelity Physical Bitcoin» (sin las participaciones ni las letras sueltas del final)."""
    t = re.sub(r"\s*@.*$", "", str(texto)).strip()
    t = re.sub(r"^(compra|venta|suscripcion|reembolso|orden|etf)( de)?\s+", "", t, flags=re.I)
    ps = t.split()
    while len(ps) > 1 and (len(ps[-1]) <= 2 or ps[-1].lower() in ("etc", "etf", "etp", "acc")): ps.pop()
    t = C.titulo(" ".join(ps))
    for a, b in (("S&p", "S&P"), ("Ishares", "iShares"), ("Etfs", "ETFS"), ("Msci", "MSCI"), ("Spdr", "SPDR"), ("Dws", "DWS"), ("Wisdomtree", "WisdomTree")):
        t = re.sub(rf"\b{re.escape(a)}\b", b, t)
    return t

def del_catalogo(texto_norm):
    """(ISIN, (nombre, clase, patrones)) del fondo conocido que nombra el texto del extracto, o None."""
    from . import plantilla
    return next(((isin, v) for isin, v in plantilla.ISIN.items() if any(C.casa(p, texto_norm) for p in v[2])), None)

def parece_valor(texto):
    """El texto es el de una compra/venta de un fondo, ETF o acción («… @ 2», un ISIN, o el nombre del producto en
    mayúsculas con varias palabras: «FIDELITY S&P 500 INDEX P ACC E»), no un concepto que escribiste tú al pasar
    dinero desde tu banco («ahorro», «Inicio», «SP500», «Bitcoin»)."""
    t = str(texto or "").strip()
    return "@" in t or bool(re.search(r"\b[A-Z]{2}[A-Z0-9]{9}\d\b", t)) or (t.isupper() and len(t.split()) >= 3) \
        or bool(re.search(r"\b(compra|venta|suscripcion|reembolso|dividendo)\b", L.norm(t)))

def sugerencia_inversion(p, activos):
    """Para «Por revisar» (bróker): el activo que parece, o el nombre y tipo del que habría que crear."""
    f = p.get("fila") or {}
    tn = L.norm(f.get("texto", ""))
    entra = f.get("importe", 0) > 0
    if entra and RE_TRASPASO.search(tn) and not re.search(r"venta|reembolso", tn): return {"accion": "ignorar"}
    if re.match(r"periodo|interes|remuneracion", tn): return {"accion": "interes"}
    if entra and RE_DIVIDENDO.search(tn):  # dividendo o cupón: de qué activo, si se reconoce
        a = next((a for a in activos if (a.get("isin") and a["isin"].lower() in tn) or L.norm(a["nombre"]) in tn or any(C.casa(x, tn) for x in (a.get("patrones") or []))), None)
        return {"accion": "dividendo", **({"activo": a["nombre"]} if a else {})}
    for a in activos:
        if a.get("isin") and a["isin"].lower() in tn: return {"accion": "activo", "activo": a["nombre"]}
    # Dinero que entra con un concepto tuyo (no el nombre de un producto): es un traspaso desde tu banco, no una venta
    if entra and not parece_valor(f.get("texto", "")) and not any(C.casa(x, tn) for a in activos for x in (a.get("patrones") or [])): return {"accion": "ignorar"}
    cat = del_catalogo(tn)
    if cat:  # un fondo conocido: con su nombre de siempre (el mismo que le darán las órdenes por su ISIN)
        isin, (nombre, clase, _) = cat
        a = next((a for a in activos if (a.get("isin") or "").upper() == isin or L.norm(a["nombre"]) == L.norm(nombre)), None)
        return {"accion": "activo", "activo": a["nombre"]} if a else {"accion": "activo", "nuevo": nombre, "clase": clase, "isin": isin}
    nombre = nombre_activo(f.get("texto", ""))
    clave = L.norm(nombre)[:14]
    parecido = next((a["nombre"] for a in activos if L.norm(a["nombre"]) in tn or L.norm(a["nombre"])[:14] == clave), None)
    if parecido: return {"accion": "activo", "activo": parecido}
    return {"accion": "activo", "nuevo": nombre, "clase": clase_activo(f.get("texto", ""))}

# ───────────── resolver lo pendiente ─────────────
def resolver(alm, pid, d):
    """d (banco): {accion: guardar|ignorar, clase, categoria, concepto, cuenta_otra, recordar, patron}
       d (inversión): {accion: activo|interes|ignorar, activo, nuevo_activo, recordar, patron}
    Con «recordar», la decisión se guarda (regla del banco, patrón del activo o acción del formato del bróker) y se
    aplica también a las demás dudas del mismo tipo y cuenta cuyo texto casa con el patrón."""
    p = alm.obtener("pendiente", pid)
    if not p: raise ValueError("Ese movimiento ya no está pendiente.")
    patron = L.norm(d.get("patron") or "")
    recordar = bool(d.get("recordar") and patron)
    with alm.transaccion():
        if p["tipo_import"] == "inversion" and d.get("accion") == "activo" and d.get("nuevo_activo"):
            nombre = str(d["nuevo_activo"]).strip()
            if not any(a["nombre"].lower() == nombre.lower() for a in alm.todos("activo")):
                clase = clase_activo(p["fila"]["texto"] + " " + nombre)
                if clase == "otro" and d.get("clase") in modelo.CAMPOS["activo"]["clase"]: clase = d["clase"]  # el tipo que proponía Jev
                nuevo = {"nombre": nombre, "clase": clase, "cuenta": p["cuenta"], "fecha_inicio": p["fila"]["op"], "aportado_inicial": 0}
                cat = del_catalogo(L.norm(p["fila"]["texto"]))
                if cat and L.norm(cat[1][0]) == L.norm(nombre): nuevo.update(clase=cat[1][1], isin=cat[0], patrones=list(cat[1][2]))
                alm.guardar("activo", nuevo)
            d = {**d, "activo": nombre}
        if p["tipo_import"] == "banco" and d.get("categoria_nueva") and d.get("accion", "guardar") == "guardar":
            d = {**d, "categoria": _categoria_nueva(alm, d["categoria_nueva"])}
        msg = _resolver_uno(alm, p, d)
        if recordar and d.get("accion") in ("ignorar", "activo", "interes") and p["tipo_import"] == "inversion":
            if d["accion"] == "activo":
                a = next(x for x in alm.todos("activo") if x["nombre"] == d["activo"])
                if patron not in (a.get("patrones") or []): alm.guardar("activo", {**a, "patrones": (a.get("patrones") or []) + [patron]}, a["id"])
            else: _accion_perfil(alm, p["perfil"], patron, d["accion"])
        elif recordar and p["tipo_import"] == "banco" and d.get("accion", "guardar") == "guardar":
            clase = d.get("clase")
            alm.guardar("regla", {"patron": patron, "categoria": d.get("categoria") if clase != "transferencia" else "", "clase": clase,
                                  "cuenta_otra": d.get("cuenta_otra") if clase == "transferencia" else "", "origen": "usuario"})
        # Las demás dudas iguales (con «recordar») y las que se han elegido a la vez (`ids`: un grupo de «Por revisar»)
        otras = 0
        ids = {int(x) for x in d.get("ids") or [] if str(x).isdigit()} - {pid}
        for q in alm.todos("pendiente"):
            if q["tipo_import"] != p["tipo_import"]: continue
            if not (q["id"] in ids or (recordar and q["cuenta"] == p["cuenta"] and C.aplica(patron, q["fila"]["texto"]))): continue
            dq = {**d, "concepto": None} if p["tipo_import"] == "banco" else d
            if p["tipo_import"] == "banco" and d.get("clase") == "transferencia" and (q["fila"]["importe"] < 0) != (p["fila"]["importe"] < 0): continue
            _resolver_uno(alm, q, dq); otras += 1
    return msg + (f" · y {otras} más iguales" if otras else "")

def _categoria_nueva(alm, c):
    """El usuario ha aceptado un consejo de categoría nueva (c: {nombre, icono?, grupo?, mostrar?}): la crea con ese nombre
    (o, si ya existe, la reutiliza y, si estaba oculta, la vuelve a mostrar). Devuelve el nombre. Nunca duplica ni pisa lo suyo."""
    nombre = " ".join(str((c or {}).get("nombre") or "").split())
    if not nombre: raise ValueError("Escribe el nombre de la categoría.")
    if len(nombre) > 40: raise ValueError("El nombre de la categoría es demasiado largo (máximo 40 letras).")
    existente = next((x for x in alm.todos("categoria") if x["nombre"].lower() == nombre.lower()), None)
    if existente:
        if existente.get("grupo") == "ingreso": raise ValueError(f"«{existente['nombre']}» es una categoría de ingresos: elige otro nombre.")
        if existente.get("oculta"): alm.guardar("categoria", {**existente, "oculta": False}, existente["id"])
        return existente["nombre"]
    grupo = c.get("grupo") if c.get("grupo") in ("variable", "fijo") else "variable"
    datos = {"nombre": nombre, "grupo": grupo}
    if str(c.get("icono") or "").strip(): datos["icono"] = str(c["icono"]).strip()
    alm.guardar("categoria", datos)
    return nombre

def _resolver_uno(alm, p, d):
    f, cuenta = p["fila"], p["cuenta"]
    accion = d.get("accion", "guardar")
    if accion == "ignorar":
        alm.insertar_crudo("ignorado", {"cuenta": cuenta, "ext_fecha": f["op"], "ext_importe": f["importe"], "ext_texto": f["texto"]})
        msg = "Descartado"
    elif p["tipo_import"] == "banco":
        clase = d.get("clase") or f.get("clase")
        cambios = {"clase": clase, "cat": d.get("categoria") or "", "concepto": d.get("concepto") or f.get("concepto"), "destino": "", "origen": ""}
        if clase == "transferencia":
            otra = d.get("cuenta_otra")
            if not otra: raise ValueError("Elige la otra cuenta del traspaso.")
            cambios["destino" if f["importe"] < 0 else "origen"] = otra
            cambios["cat"] = ""
        elif not cambios["cat"]: raise ValueError("Elige una categoría.")
        if clase == "gasto" and f["importe"] > 0: cambios["clase"] = "reembolso"
        if clase in ("ingreso", "reembolso") and f["importe"] < 0: cambios["clase"] = "gasto"
        if cambios["clase"] == "reembolso" and str(d.get("reembolsa") or "").isdigit():  # el gasto que devuelve, elegido por ti
            g = alm.obtener("movimiento", int(d["reembolsa"]))
            if g and g.get("clase") == "gasto": cambios["reembolsa"] = g["id"]
        fila = {**f, **cambios}
        fila = C.enlazar({"clase": fila["clase"], "cat": fila["cat"], "concepto": fila["concepto"]}, f, alm.todos("recurrente")) | {k: v for k, v in fila.items() if k not in ("clase", "cat", "concepto")}
        alm.insertar_crudo("movimiento", movimiento_de(fila, cuenta))
        msg = f"Guardado: {cambios['concepto']}"
    elif accion == "activo":
        nombre = d.get("activo")
        if not any(x["nombre"] == nombre for x in alm.todos("activo")): raise ValueError("Elige el activo.")
        signo = -1 if next((pp for pp in alm.todos("perfil") if pp["nombre"] == p["perfil"]), {}).get("compras_negativas", True) else 1
        if OP.casar_movimiento(alm, f, cuenta, nombre, signo):
            alm.borrar("pendiente", p["id"])
            return f"Ya estaba en tus órdenes: {nombre}"
        alm.insertar_crudo("aportacion", modelo.limpiar("aportacion", {"fecha": f["op"], "activo": nombre, "importe": round(signo * f["importe"], 2),
                           "participaciones": participaciones(f["texto"], signo * f["importe"]),
                           "cuenta": cuenta, "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"]}))
        msg = f"Guardado: {'compra' if signo * f['importe'] > 0 else 'venta'} de {nombre}"
    elif accion == "dividendo":
        nombre = d.get("activo")
        if not any(x["nombre"] == nombre for x in alm.todos("activo")): raise ValueError("Elige de qué activo es el dividendo.")
        if f["importe"] <= 0: raise ValueError("Un dividendo es dinero que entra.")
        alm.insertar_crudo("cobro", modelo.limpiar("cobro", {"fecha": f["op"], "activo": nombre, "tipo": "dividendo", "importe": f["importe"], "cuenta": cuenta,
                                                             "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"]}))
        msg = f"Guardado: dividendo de {nombre}"
    elif accion == "interes":
        alm.insertar_crudo("movimiento", modelo.limpiar("movimiento", {"fecha": f["op"], "clase": "ingreso" if f["importe"] > 0 else "gasto",
            "categoria": cat_intereses(alm) if f["importe"] > 0 else "Comisiones", "importe": abs(f["importe"]), "cuenta": cuenta,
            "concepto": f"Intereses {cuenta}" if f["importe"] > 0 else f"Comisión {cuenta}", "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"]}))
        msg = "Guardado como intereses" if f["importe"] > 0 else "Guardado como comisión"
    else: raise ValueError("Acción no válida.")
    alm.borrar("pendiente", p["id"])
    return msg

def _accion_perfil(alm, perfil_nombre, patron, accion):
    p = next((x for x in alm.todos("perfil") if x["nombre"] == perfil_nombre), None)
    if not p: return
    acc = [a for a in (p.get("acciones") or []) if a.get("patron") != patron] + [{"patron": patron, "accion": accion}]
    alm.guardar("perfil", {**p, "acciones": acc}, p["id"])

def confirmar_sugeridos(alm, ids=None):
    """Da por buenas las categorías sugeridas (todas, o solo las de `ids`). → nº de movimientos confirmados."""
    ids = None if ids is None else {int(x) for x in ids if str(x).isdigit()}
    n = 0
    with alm.transaccion():
        for m in alm.todos("movimiento"):
            if m.get("sugerido") and (ids is None or m["id"] in ids): alm.guardar("movimiento", {**m, "sugerido": ""}, m["id"]); n += 1
    return n

# ───────────── cambiar la categoría de un movimiento (y de los parecidos) ─────────────
def _parecidos(alm, m):
    """Otros movimientos importados del mismo comercio y sentido que `m` (mismo patrón que usaría una regla)."""
    patron = C.clave(m.get("ext_texto") or m.get("concepto") or "")
    if len(patron) < 3: return patron, []
    entra = m["clase"] == "ingreso"
    out = [x for x in alm.todos("movimiento") if x["id"] != m["id"] and x.get("clase") in ("gasto", "ingreso", "reembolso") and not x.get("parte_de")
           and (x["clase"] == "ingreso") == entra and C.aplica(patron, x.get("ext_texto") or x.get("concepto") or "")]
    return patron, out

def parecidos(alm, mid):
    m = alm.obtener("movimiento", mid)
    if not m: raise ValueError("Ese movimiento ya no existe.")
    patron, otros = _parecidos(alm, m)
    # Tu regla de este comercio, si ya la tienes: «recordar» la reescribiría, así que la página avisa en vez de hacerlo sola.
    # Solo las tuyas: sobre una de la plantilla sí se puede poner la tuya encima (es lo que hace «recordar» la primera vez).
    r = next((x for x in alm.todos("regla") if x.get("origen") != "plantilla" and patron and L.norm(x["patron"]) == patron), None)
    return {"patron": patron, "n": len(otros), "distintos": sum(1 for x in otros if x.get("categoria") != m.get("categoria")),
            "regla": {"id": r["id"], "categoria": r.get("categoria") or ""} if r else None}

def recategorizar(alm, mid, d):
    """d: {categoria, parecidos: bool, recordar: bool}. Cambia la categoría del movimiento; con `parecidos`, también la de
    los demás del mismo comercio y las dudas pendientes iguales; con `recordar`, crea (o actualiza) la regla."""
    m = alm.obtener("movimiento", mid)
    if not m: raise ValueError("Ese movimiento ya no existe.")
    if m.get("clase") not in ("gasto", "ingreso", "reembolso"): raise ValueError("Solo se puede cambiar la categoría de gastos e ingresos.")
    cat = str(d.get("categoria") or "").strip()
    if not any(c["nombre"] == cat for c in alm.todos("categoria")): raise ValueError("Elige una categoría.")
    n = 0
    with alm.transaccion():
        alm.guardar("movimiento", {**m, "categoria": cat, "sugerido": ""}, m["id"])  # elegirla tú la confirma
        patron, otros = _parecidos(alm, m)
        if d.get("parecidos") and patron:
            for x in otros:
                if x.get("categoria") != cat or x.get("sugerido"): alm.guardar("movimiento", {**x, "categoria": cat, "sugerido": ""}, x["id"]); n += (x.get("categoria") != cat)
            clase = "ingreso" if m["clase"] == "ingreso" else "gasto"
            for q in alm.todos("pendiente"):
                if q["tipo_import"] == "banco" and (q["fila"]["importe"] > 0) == (clase == "ingreso") and C.aplica(patron, q["fila"]["texto"]):
                    _resolver_uno(alm, q, {"accion": "guardar", "clase": clase, "categoria": cat}); n += 1
        if d.get("recordar") and patron:
            clase = "ingreso" if m["clase"] == "ingreso" else "gasto"
            r = next((x for x in alm.todos("regla") if x.get("origen") != "plantilla" and L.norm(x["patron"]) == patron), None)
            alm.guardar("regla", {**(r or {}), "patron": patron, "categoria": cat, "clase": clase, "origen": "usuario"}, r["id"] if r else None)
    return f"Ahora es {cat}" + (f" · y {n} más de «{C.titulo(patron)}»" if n else "") + (" · lo recordaré" if d.get("recordar") and patron else "")

# ───────────── dividir un movimiento en varias categorías ─────────────
def partes_de(alm, m):
    """Las partes del movimiento dividido al que pertenece `m` (por id), o [] si no está dividido."""
    return sorted((x for x in alm.todos("movimiento") if x.get("parte_de") == m.get("parte_de")), key=lambda x: x["id"]) if m.get("parte_de") else []

def dividir(alm, mid, partes):
    """Parte un gasto o un ingreso en varias categorías. partes: [{importe, categoria, nota?}], que tienen que sumar su importe.
    La primera se queda en el movimiento original; las demás son movimientos nuevos con su misma fecha, cuenta, concepto y
    huella del extracto (al reimportar, entre todas cuentan como una fila: huellas_existentes). Todas llevan `parte_de` = id
    del original: quedan fuera de los cambios «a todo el comercio», de las reglas y de lo que la app aprende de tu historial."""
    m = alm.obtener("movimiento", mid)
    if not m: raise ValueError("Ese movimiento ya no existe.")
    if m.get("clase") not in ("gasto", "ingreso"): raise ValueError("Solo se pueden dividir gastos e ingresos.")
    if m.get("parte_de"): raise ValueError("Este movimiento ya es una parte: vuelve a juntarlo para dividirlo de otra forma.")
    if m.get("recurrente"): raise ValueError("Es el pago de un fijo: quítale antes el enlace con el fijo.")
    if any(x.get("reembolsa") == m["id"] for x in alm.todos("movimiento")):
        raise ValueError("Te han devuelto parte de este gasto (tiene Bizums enlazados): quita antes esos enlaces.")
    cats = {c["nombre"] for c in alm.todos("categoria")}
    limpias = []
    for p in partes if isinstance(partes, list) else []:
        imp = modelo.numero((p or {}).get("importe"))
        cat = str((p or {}).get("categoria") or "").strip()
        if not imp or imp <= 0: raise ValueError("Cada parte necesita un importe mayor que cero.")
        if cat not in cats: raise ValueError("Elige la categoría de cada parte.")
        limpias.append({"importe": imp, "categoria": cat, "nota": str((p or {}).get("nota") or "").strip()})
    if not 2 <= len(limpias) <= 6: raise ValueError("Divídelo en entre 2 y 6 partes.")
    total = round(sum(p["importe"] for p in limpias), 2)
    if abs(total - m["importe"]) >= 0.005:
        raise ValueError(f"Las partes suman {total:.2f} € y el movimiento es de {m['importe']:.2f} €".replace(".", ",") + ".")
    base = {k: v for k, v in m.items() if k not in ("id", "nota", "sugerido", "sin_gasto")}
    with alm.transaccion():
        for i, p in enumerate(limpias):
            alm.guardar("movimiento", {**base, **p, "parte_de": m["id"]}, m["id"] if i == 0 else None)
    return f"Dividido en {len(limpias)} partes"

def juntar(alm, mid):
    """Deshace una división: vuelve a un solo movimiento con el importe entero (el del extracto, si viene de uno) y la
    categoría de la primera parte."""
    m = alm.obtener("movimiento", mid)
    if not m: raise ValueError("Ese movimiento ya no existe.")
    partes = partes_de(alm, m)
    if not partes: raise ValueError("Este movimiento no está dividido.")
    primera = next((x for x in partes if x["id"] == m["parte_de"]), partes[0])
    total = abs(primera["ext_importe"]) if primera.get("ext_importe") else round(sum(x["importe"] for x in partes), 2)
    with alm.transaccion():
        for x in partes:
            if x["id"] != primera["id"]: alm.borrar("movimiento", x["id"])
        alm.guardar("movimiento", {**{k: v for k, v in primera.items() if k not in ("id", "parte_de")}, "importe": total}, primera["id"])
    return primera["id"]
