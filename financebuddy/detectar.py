# Lo que se deduce de los movimientos importados: ingresos y gastos que se repiten cada mes (para proponerlos como
# recurrentes con su regla) y de dónde viene el dinero (ingresos agrupados por quién los paga).
import re, statistics
from collections import Counter, defaultdict
from . import clasificar as C, modelo
from .lectura import norm

RE_BIZUM = re.compile(r"bizum (?:a favor de|enviado a|recibido de|de|a)\s+(.+?)(?:\s+concepto:?\s*(.*))?$")

def origen(m, con_concepto=False):
    """Texto corto que identifica de quién viene o a quién va un movimiento: pagador, comercio o persona del Bizum.
    con_concepto: en los Bizums añade la primera palabra del concepto («carlos lopez concepto: wifi»)."""
    t = m.get("ext_texto") or m.get("concepto") or ""
    tn = C.limpio(t)
    b = RE_BIZUM.search(tn)
    if b:
        quien = b.group(1).strip(" ,.")
        conc = (b.group(2) or "").strip(" ,.")
        if con_concepto and conc and "sin concepto" not in conc:
            m2 = re.search(rf"{re.escape(quien)}\s+concepto:?\s*[^\s,.]+", tn)
            if m2: return m2.group(0)
        return quien
    return C.patron_sugerido(t) or norm(m.get("concepto") or "")

def _meses_entre(a, b):
    return (int(b[:4]) * 12 + int(b[5:7])) - (int(a[:4]) * 12 + int(a[5:7]))

def _dispersion_dias(ds):
    """Diferencia entre el primer y el último día del mes en que llega, teniendo en cuenta el cambio de mes (30 → 2)."""
    girados = [(d + 15) % 31 for d in ds]
    return min(max(ds) - min(ds), max(girados) - min(girados))

def _etiqueta(k):
    palabras = C.titulo(k).split(" ")
    while len(palabras) > 1 and palabras[-1].lower() in ("and", "y", "e", "de", "del", "la", "el", "los", "las"): palabras.pop()
    return re.sub(r"\b(Sl|Sa|Slu|Sau|Sc|Cb)\b", lambda m: m.group(0).upper(), " ".join(palabras))

def _nombre(clave, categoria, clase):
    quien, _, conc = clave.partition(" concepto")
    base = _etiqueta(quien)
    conc = conc.strip(" :")
    if conc: return f"{C.titulo(conc)} ({base.split(' ')[0]})"
    if clase == "ingreso" and categoria == "Nómina": return f"Nómina {base}"
    return base

def fijos(alm):
    """Propuestas de recurrentes: mismo origen, al menos dos meses seguidos, una vez al mes, importe y día parecidos."""
    movs = [m for m in alm.todos("movimiento") if m.get("clase") in ("gasto", "ingreso")]
    if not movs: return []
    cats = {c["nombre"]: c.get("grupo") for c in alm.todos("categoria")}
    recs = alm.todos("recurrente")
    con_rec = {norm(r["patron"]) for r in alm.todos("regla") if r.get("recurrente")}
    ultimo = max(m["fecha"][:7] for m in movs)
    grupos = defaultdict(list)
    for m in movs:
        k = origen(m, con_concepto=True)
        if k and len(k) >= 3: grupos[(m["clase"], k)].append(m)
    nombres = {norm(r["nombre"]) for r in recs}
    out = []
    for (clase, k), ms in grupos.items():
        if k in con_rec or any(m.get("recurrente") for m in ms): continue
        por_mes = defaultdict(list)
        for m in ms: por_mes[m["fecha"][:7]].append(m)
        meses = sorted(por_mes)
        if len(meses) < 2 or _meses_entre(meses[-1], ultimo) > 1: continue
        if any(_meses_entre(a, b) > 2 for a, b in zip(meses, meses[1:])): continue
        if sum(len(v) > 1 for v in por_mes.values()) > max(1, len(meses) // 3): continue
        mediana = statistics.median(float(m["importe"]) for m in ms)
        principal = [min(por_mes[x], key=lambda m: abs(float(m["importe"]) - mediana)) for x in meses]
        imps = [float(m["importe"]) for m in principal]
        if min(imps) <= 0 or max(imps) / min(imps) > 1.25: continue
        dias = [int(m["fecha"][8:10]) for m in principal]
        if _dispersion_dias(dias) > 7: continue
        cat = Counter(m.get("categoria") or "" for m in ms).most_common(1)[0][0] or ("Otros ingresos" if clase == "ingreso" else "Otros")
        if clase == "ingreso" and cat == "Otros ingresos" and re.search(r"\bnomina\b", norm(" ".join(m.get("ext_texto", "") for m in ms))): cat = "Nómina"
        grupo = cats.get(cat) or ("ingreso" if clase == "ingreso" else "variable")
        if grupo == "variable" and len(meses) < 3: continue  # dos compras parecidas en el súper no son un fijo
        ult = principal[-1]
        if any(r.get("clase") == clase and r.get("categoria") == cat and r.get("activo") is not False
               and abs(float(r.get("importe") or 0) - float(ult["importe"])) <= 0.10 * float(ult["importe"]) for r in recs): continue
        nombre, n = _nombre(k, cat, clase), 2
        base = nombre
        while norm(nombre) in nombres: nombre = f"{base} {n}"; n += 1
        nombres.add(norm(nombre))
        out.append({"nombre": nombre, "clase": clase, "categoria": cat, "grupo": grupo,
                    "importe": round(float(ult["importe"]), 2), "dia": int(ult["fecha"][8:10]), "desde": meses[-1] + "-01", "patron": k,
                    "meses": len(meses), "importes": [round(x, 2) for x in imps], "ejemplo": ult.get("ext_texto") or ult.get("concepto") or ""})
    orden = {"ingreso": 0, "fijo": 1, "variable": 2}
    return sorted(out, key=lambda f: (orden.get(f["grupo"], 3), -f["importe"]))

def origenes(alm):
    """Ingresos, devoluciones y entradas desde tus otras cuentas, agrupados por quién los paga (de más a menos)."""
    movs = alm.todos("movimiento")
    # La media se calcula sobre los meses con actividad de la cuenta en la que entra (no los de un solo interés suelto)
    por_cuenta_mes = Counter((m.get("cuenta") or "", m["fecha"][:7]) for m in movs)
    meses_cuenta = defaultdict(set)
    for (c, mes), n in por_cuenta_mes.items():
        if n >= 3: meses_cuenta[c].add(mes)
    acc = {}
    for m in movs:
        clase = m.get("clase")
        if clase in ("ingreso", "reembolso"):
            k = origen(m)
            etiqueta, cat = _etiqueta(k), m.get("categoria") or ""
        elif clase == "transferencia" and m.get("origen"):
            k = "cuenta:" + m["origen"]
            etiqueta, cat = f"Tu cuenta {m['origen']}", "Entre tus cuentas"
        else: continue
        if not k: continue
        a = acc.setdefault(k, {"origen": etiqueta, "total": 0.0, "veces": 0, "cats": Counter(), "clases": Counter(), "cuentas": Counter(), "fijo": ""})
        a["total"] += float(m["importe"]); a["veces"] += 1; a["cats"][cat] += 1; a["clases"][clase] += 1; a["cuentas"][m.get("cuenta") or ""] += 1
        if m.get("recurrente"): a["fijo"] = m["recurrente"]
    out = []
    for a in acc.values():
        clase = a["clases"].most_common(1)[0][0]
        tipo = {"ingreso": "Ingreso", "reembolso": "Te lo devolvieron", "transferencia": "Entre tus cuentas"}[clase]
        cat = a["cats"].most_common(1)[0][0]
        n_meses = len(meses_cuenta[a["cuentas"].most_common(1)[0][0]]) or 1
        out.append({"origen": a["origen"], "tipo": tipo, "categoria": cat if cat and cat != tipo else "", "veces": a["veces"],
                    "total": round(a["total"], 2), "media_mes": round(a["total"] / n_meses, 2), "fijo": a["fijo"]})
    return sorted(out, key=lambda o: -o["total"])

def crear(alm, lista):
    """Crea los recurrentes elegidos, una regla para reconocerlos al importar y enlaza lo ya importado desde `desde`."""
    creados = enlazados = 0
    with alm.transaccion():
        for p in lista:
            nombre = re.sub(r"\s+", " ", str(p.get("nombre") or "")).strip()
            if not nombre: continue
            if any(norm(r["nombre"]) == norm(nombre) for r in alm.todos("recurrente")): raise ValueError(f"Ya tienes un recurrente llamado «{nombre}».")
            rec = modelo.limpiar("recurrente", {"nombre": nombre, "clase": p.get("clase"), "categoria": p.get("categoria"), "importe": p.get("importe"),
                                                "dia": p.get("dia"), "desde": p.get("desde")})
            alm.guardar("recurrente", rec)
            creados += 1
            patron = norm(p.get("patron") or "")
            if not patron: continue
            r = next((x for x in alm.todos("regla") if x.get("origen") != "plantilla" and norm(x["patron"]) == patron), None)
            alm.guardar("regla", {**(r or {}), "patron": patron, "categoria": rec.get("categoria", ""), "clase": rec["clase"], "recurrente": nombre,
                                  "origen": "usuario"}, r["id"] if r else None)
            usados = set()
            for m in sorted(alm.todos("movimiento"), key=lambda m: m["fecha"]):
                if m.get("clase") != rec["clase"] or m.get("recurrente") or m["fecha"] < rec["desde"] or m["fecha"][:7] in usados: continue
                if C.aplica(patron, m.get("ext_texto") or m.get("concepto") or ""):
                    alm.guardar("movimiento", {**m, "recurrente": nombre, "categoria": rec.get("categoria") or m.get("categoria")}, m["id"])
                    usados.add(m["fecha"][:7]); enlazados += 1
    return f"{creados} fijo{'s' if creados != 1 else ''} creado{'s' if creados != 1 else ''}" + (f" · {enlazados} movimiento{'s' if enlazados != 1 else ''} enlazado{'s' if enlazados != 1 else ''}" if enlazados else "")
