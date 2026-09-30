# Importación de extractos: banco (movimientos) e inversión (compras/ventas de activos e intereses).
#
# Flujo de un archivo: reconocer su formato (perfil) → leer las filas → (banco) comprobar la cadena de saldos →
# clasificar → descartar lo ya importado (huella del extracto) → guardar lo claro y dejar lo dudoso «por revisar».
# Si el formato no se reconoce, devuelve lo necesario para que el usuario diga qué columna es cada cosa.
import datetime, os, re, shutil
from collections import Counter
from . import clasificar as C, lectura as L, modelo

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
        val = L.fecha(cel("fecha_valor")) if "fecha_valor" in idx else None
        if val: fila["val"] = val
        if "saldo" in idx:
            s = L.numero(cel("saldo"))
            if s is not None: fila["saldo"] = round(s, 2)
        filas.append(fila)
    if not filas: raise ValueError("El archivo no tiene movimientos (o las columnas elegidas no son las correctas).")
    return perfil, filas

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
            partidas.add((*k, L.norm(r.get("ext_texto", ""))))
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
    # Clasificar de la más antigua a la más reciente (los Bizums recibidos miran los gastos de antes)
    for f in reversed(filas):
        f.update(C.clasificar_fila(f, filas, reglas, cuentas, recs, cuenta, categorias=grupos, mem=mem, titulares=titulares))
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
            "existentes": existentes, "dudas": len(dudas), "aprendidas": aprendidas, "desde": filas[-1]["op"], "hasta": filas[0]["op"],
            "mensaje": f"{cuenta}: {len(nuevas)} movimientos nuevos" + (f" ({aprendidas} clasificados por lo que ya sabía de ti)" if aprendidas else "")
                       + (f", {len(dudas)} por revisar" if dudas else "")
                       + (f" ({existentes} ya estaban)" if existentes else "") + f" · del {fmt(filas[-1]['op'])} al {fmt(filas[0]['op'])}"}

def movimiento_de(f, cuenta, **cambios):
    """Fila del extracto ya clasificada → registro de movimiento (validado)."""
    f = {**f, **cambios}
    d = {"fecha": min(f["op"], f.get("val") or f["op"]), "clase": f["clase"], "categoria": f.get("cat") if f["clase"] != "transferencia" else "",
         "importe": abs(f["importe"]), "cuenta": cuenta, "concepto": f.get("concepto") or C.titulo(f["texto"]),
         "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"]}
    for k in ("recurrente", "destino", "origen"):
        if f.get(k): d[k] = f[k]
    return modelo.limpiar("movimiento", d)

# ───────────── inversión ─────────────
def importar_inversion(alm, ruta, cuenta=None, perfil_nombre=None):
    info = {}
    perfil, filas = leer(ruta, alm, "inversion", perfil_nombre, info)
    cuentas = alm.todos("cuenta")
    cuenta = cuenta or cuenta_por_iban(cuentas, info.get("iban")) or perfil.get("cuenta")
    if not cuenta or not any(c["nombre"] == cuenta for c in cuentas):
        raise NecesitaCuenta({"archivo": os.path.basename(ruta), "tipo": "inversion", "perfil": perfil["nombre"],
                              "cuentas": [c["nombre"] for c in cuentas if c.get("tipo") == "broker"]})
    activos = [a for a in alm.todos("activo")]
    acciones = perfil.get("acciones") or []
    signo = -1 if perfil.get("compras_negativas", True) else 1
    huellas_ap = huellas_existentes(alm, cuenta, "aportacion")
    huellas_mov = huellas_existentes(alm, cuenta, "movimiento")
    # Aportaciones registradas a mano (sin huella): misma fecha, importe y activo
    manuales = Counter((a["fecha"], round(float(a["importe"]), 2), a["activo"]) for a in alm.todos("aportacion") if not a.get("ext_fecha"))
    recs = [r for r in alm.todos("recurrente") if r.get("clase") == "aportacion"]
    nuevas_ap, nuevos_mov, dudas, existentes, ignoradas = [], [], [], 0, 0
    for f in sorted(filas, key=lambda x: x["op"]):
        k = (f["op"], round(f["importe"], 2))
        tn = L.norm(f["texto"])
        activo = next((a for a in activos if any(C.casa(p, tn) for p in a.get("patrones") or [])), None)
        accion = next((x["accion"] for x in acciones if C.casa(x.get("patron", ""), tn)), None)
        if activo:
            imp = round(signo * f["importe"], 2)
            if huellas_ap[k] > 0: huellas_ap[k] -= 1; existentes += 1; continue
            km = (f["op"], imp, activo["nombre"])
            if manuales[km] > 0: manuales[km] -= 1; existentes += 1; continue
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
            duda = ("Entrada de dinero: ¿es un traspaso desde tu banco (se ignora aquí), intereses o la venta de un activo?" if f["importe"] > 0
                    else "Salida de dinero: ¿es la compra de un activo (¿cuál?), una comisión o un traspaso a tu banco?")
            dudas.append({**f, "patron": C.patron_sugerido(f["texto"]), "duda": duda})
    with alm.transaccion():
        for d in nuevas_ap: alm.insertar_crudo("aportacion", d)
        for d in nuevos_mov: alm.insertar_crudo("movimiento", d)
        for f in dudas:
            alm.insertar_crudo("pendiente", {"tipo_import": "inversion", "cuenta": cuenta, "archivo": os.path.basename(ruta),
                                             "perfil": perfil["nombre"], "fila": f, "duda": f["duda"]})
        if not perfil.get("cuenta"): alm.guardar("perfil", {**perfil, "cuenta": cuenta}, perfil["id"])
        recordar_cabecera(alm, info, cuenta)
    n = len(nuevas_ap) + len(nuevos_mov)
    ops = sorted(f["op"] for f in filas)
    return {"ok": True, "tipo": "inversion", "cuenta": cuenta, "perfil": perfil["nombre"], "filas": len(filas), "nuevas": n,
            "existentes": existentes, "dudas": len(dudas), "desde": ops[0], "hasta": ops[-1],
            "mensaje": f"{cuenta}: {len(nuevas_ap)} compras/ventas y {len(nuevos_mov)} intereses nuevos" + (f", {len(dudas)} por revisar" if dudas else "")
                       + (f" ({existentes} ya estaban)" if existentes else "") + (f" · {ignoradas} traspasos ignorados" if ignoradas else "")}

def cat_intereses(alm):
    return "Intereses" if any(c["nombre"] == "Intereses" for c in alm.todos("categoria")) else "Otros ingresos"

# ───────────── traspasos entre tus cuentas (cruce de extractos) ─────────────
RE_TRASPASO = re.compile(r"transferencia|traspaso|ahorro|a favor de|inversi|aportaci")

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
    """banco | inversion según la carpeta en la que está; si está en la raíz de Importar, según el formato."""
    d = os.path.dirname(os.path.abspath(ruta))
    if d == os.path.abspath(carpeta.banco): return "banco"
    if d == os.path.abspath(carpeta.inversion): return "inversion"
    rec = L.reconocer(L.filas_crudas(ruta), alm.todos("perfil"))
    return rec[0]["tipo"] if rec else None

def importar_archivo(alm, carpeta, ruta, tipo=None, cuenta=None, perfil_nombre=None):
    """Importa un archivo y, si va bien, lo mueve a Importar\\Procesados. Lanza NecesitaPerfil / NecesitaCuenta."""
    tipo = tipo or tipo_de(ruta, alm, carpeta)
    if tipo is None:
        raise NecesitaPerfil({"archivo": os.path.basename(ruta), "tipo": None, **L.muestra_para_configurar(L.filas_crudas(ruta))})
    alm.copia(carpeta.copias)
    r = (importar_banco if tipo == "banco" else importar_inversion)(alm, ruta, cuenta, perfil_nombre)
    if r.get("ok"):
        t = emparejar_traspasos(alm)
        if t:
            antes = r.get("dudas", 0)
            r["traspasos"] = t
            r["dudas"] = sum(1 for p in alm.todos("pendiente") if p.get("archivo") == os.path.basename(ruta) and p.get("cuenta") == r.get("cuenta"))
            if antes: r["mensaje"] = r["mensaje"].replace(f", {antes} por revisar", f", {r['dudas']} por revisar" if r["dudas"] else "")
            r["mensaje"] += f" · {t} traspaso{'s' if t > 1 else ''} entre tus cuentas reconocido{'s' if t > 1 else ''}"
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
    return C.titulo(" ".join(ps)).replace("S&p", "S&P")

def sugerencia_inversion(p, activos):
    """Para «Por revisar» (bróker): el activo que parece, o el nombre y tipo del que habría que crear."""
    f = p.get("fila") or {}
    tn = L.norm(f.get("texto", ""))
    if f.get("importe", 0) > 0 and RE_TRASPASO.search(tn) and not re.search(r"venta|reembolso", tn): return {"accion": "ignorar"}
    if re.match(r"periodo|interes|remuneracion", tn): return {"accion": "interes"}
    for a in activos:
        if a.get("isin") and a["isin"].lower() in tn: return {"accion": "activo", "activo": a["nombre"]}
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
                alm.guardar("activo", {"nombre": nombre, "clase": clase, "cuenta": p["cuenta"], "fecha_inicio": p["fila"]["op"], "aportado_inicial": 0})
            d = {**d, "activo": nombre}
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
        fila = {**f, **cambios}
        fila = C.enlazar({"clase": fila["clase"], "cat": fila["cat"], "concepto": fila["concepto"]}, f, alm.todos("recurrente")) | {k: v for k, v in fila.items() if k not in ("clase", "cat", "concepto")}
        alm.insertar_crudo("movimiento", movimiento_de(fila, cuenta))
        msg = f"Guardado: {cambios['concepto']}"
    elif accion == "activo":
        nombre = d.get("activo")
        if not any(x["nombre"] == nombre for x in alm.todos("activo")): raise ValueError("Elige el activo.")
        signo = -1 if next((pp for pp in alm.todos("perfil") if pp["nombre"] == p["perfil"]), {}).get("compras_negativas", True) else 1
        alm.insertar_crudo("aportacion", modelo.limpiar("aportacion", {"fecha": f["op"], "activo": nombre, "importe": round(signo * f["importe"], 2),
                           "participaciones": participaciones(f["texto"], signo * f["importe"]),
                           "cuenta": cuenta, "ext_texto": f["texto"], "ext_importe": f["importe"], "ext_fecha": f["op"]}))
        msg = f"Guardado: {'compra' if signo * f['importe'] > 0 else 'venta'} de {nombre}"
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

# ───────────── cambiar la categoría de un movimiento (y de los parecidos) ─────────────
def _parecidos(alm, m):
    """Otros movimientos importados del mismo comercio y sentido que `m` (mismo patrón que usaría una regla)."""
    patron = C.clave(m.get("ext_texto") or m.get("concepto") or "")
    if len(patron) < 3: return patron, []
    entra = m["clase"] == "ingreso"
    out = [x for x in alm.todos("movimiento") if x["id"] != m["id"] and x.get("clase") in ("gasto", "ingreso", "reembolso")
           and (x["clase"] == "ingreso") == entra and C.aplica(patron, x.get("ext_texto") or x.get("concepto") or "")]
    return patron, out

def parecidos(alm, mid):
    m = alm.obtener("movimiento", mid)
    if not m: raise ValueError("Ese movimiento ya no existe.")
    patron, otros = _parecidos(alm, m)
    return {"patron": patron, "n": len(otros), "distintos": sum(1 for x in otros if x.get("categoria") != m.get("categoria"))}

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
        alm.guardar("movimiento", {**m, "categoria": cat}, m["id"])
        patron, otros = _parecidos(alm, m)
        if d.get("parecidos") and patron:
            for x in otros:
                if x.get("categoria") != cat: alm.guardar("movimiento", {**x, "categoria": cat}, x["id"]); n += 1
            clase = "ingreso" if m["clase"] == "ingreso" else "gasto"
            for q in alm.todos("pendiente"):
                if q["tipo_import"] == "banco" and (q["fila"]["importe"] > 0) == (clase == "ingreso") and C.aplica(patron, q["fila"]["texto"]):
                    _resolver_uno(alm, q, {"accion": "guardar", "clase": clase, "categoria": cat}); n += 1
        if d.get("recordar") and patron:
            clase = "ingreso" if m["clase"] == "ingreso" else "gasto"
            r = next((x for x in alm.todos("regla") if x.get("origen") != "plantilla" and L.norm(x["patron"]) == patron), None)
            alm.guardar("regla", {**(r or {}), "patron": patron, "categoria": cat, "clase": clase, "origen": "usuario"}, r["id"] if r else None)
    return f"Ahora es {cat}" + (f" · y {n} más de «{C.titulo(patron)}»" if n else "") + (" · lo recordaré" if d.get("recordar") and patron else "")
