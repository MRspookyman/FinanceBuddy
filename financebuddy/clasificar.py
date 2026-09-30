# Clasificación automática de los movimientos del banco: reglas (patrón → categoría), traspasos entre las cuentas
# del usuario, Bizums, devoluciones y enlace con los recurrentes. Lo que no se sabe clasificar lleva `duda`.
import datetime, difflib, re
from collections import Counter
from .lectura import norm

def casa(patron, texto_norm):
    """El patrón aparece al principio de una palabra («aldi» no casa con «Valdicio»); los de ≤ 3 letras, palabra completa."""
    p = norm(patron)
    if not p: return False
    fin = r"(?![a-z0-9])" if len(p) <= 3 else ""
    return re.search(rf"(?<![a-z0-9]){re.escape(p)}{fin}", texto_norm) is not None

def ordenar_reglas(reglas):
    """Las del usuario primero (las más recientes antes), luego las de la plantilla en su orden."""
    usuario = sorted([r for r in reglas if r.get("origen") != "plantilla"], key=lambda r: -r.get("id", 0))
    return usuario + [r for r in reglas if r.get("origen") == "plantilla"]

# Coletillas que añaden los bancos y que no dicen nada del movimiento (y confundirían a las reglas: «COMISION 0,00»).
RUIDO = [r"\b\d{0,6}[x*]{4,}\d{0,4}\b", r",?\s*tarjeta\s*\d[\d*x ]{3,}", r",?\s*tarj\.?\s*:?\s*\*?\d{3,}", r",?\s*comision\s+0[,.]00"]
# Número de tarjeta enmascarado («5540XXXXXXXX1234», «****1234»): no identifica el comercio.
RE_TARJETA = re.compile(r"\b\d{0,6}[x*]{4,}\d{0,4}\b", re.I)

def limpio(texto):
    t = norm(texto)
    for r in RUIDO: t = re.sub(r, " ", t)
    return re.sub(r"\s+", " ", t).strip(" ,")

def regla_para(texto, reglas):
    t = limpio(texto)
    return next((r for r in reglas if casa(r["patron"], t)), None)

def titulo(s):
    s = re.sub(r"\s+", " ", str(s)).strip(" ,./")
    if s.isupper() and len(s) > 4: s = s.lower()  # «MERCADONA VALENCIA» → «Mercadona Valencia»
    return " ".join(w if (w.isupper() and len(w) <= 4) else w.capitalize() for w in s.split(" "))[:60]

RE_COMERCIO = re.compile(r"(?:pago movil en|transaccion contactless en|compra internet en|compra con tarjeta en|pago con tarjeta en|cargo por compra en|"
                         r"compra en|pago en|compra tarj\.?(?:\s*:)?|compra)\s+(.+?)(?:,|$)", re.I)

def comercio(texto):
    """Nombre del comercio en textos del tipo «Compra X, Ciudad…» (o None)."""
    m = RE_COMERCIO.search(re.sub(r"\s+", " ", RE_TARJETA.sub(" ", texto)))
    if not m: return None
    return titulo(re.sub(r"\s+\d{3,}$", "", m.group(1).strip()))

def patron_sugerido(texto):
    """Texto corto que identifica el movimiento, para ofrecer «recordar para la próxima vez»."""
    c = comercio(texto)
    if c: return norm(c)
    t = limpio(texto)
    t = re.sub(r"^(recibo|adeudo|transferencia|bizum|cargo|abono|pago)( inmediata| recibida| emitida)?( a favor de| de| a)?\s+", "", t)
    t = re.sub(r"^[^a-z0-9]+", "", t)
    t = re.sub(r"\b(concepto|ref|referencia)\b.*$", "", t)
    t = re.sub(r"(^|\s)[\d/.,:-]{4,}.*$", "", t).strip()
    return " ".join(t.split(" ")[:3]).strip(" ,.;:")

# Palabras del concepto de un Bizum → categoría
KW_BIZUM = [(r"\b(cena|comida|comi|comer|copa|copas|cerve|cerveza|desayun|bocata|pizza|tapas|vermu|burger|chiringo|tinto|cocacola|refresco|cafe|helado|kebab|sushi|bar\b)", "Comer fuera"),
            (r"\b(padel|cine|entrada|concierto|futbol|partido)", "Ocio"), (r"\b(cumple|regalo)", "Regalos"),
            (r"\b(wifi|luz|agua|gas|internet)", "Suministros"), (r"\b(alquiler|piso)", "Vivienda"),
            (r"\b(gasolina|gasofa|peaje)", "Coche"), (r"\b(taxi|uber|cabify)", "Transporte"), (r"\b(viaje|hotel|vuelo|billete)", "Viajes"),
            (r"\b(super|compra)", "Supermercado")]

def cat_por_palabras(s):
    return next((c for pat, c in KW_BIZUM if re.search(pat, norm(s))), None)

# ───────────── lo aprendido de tu historial ─────────────
# Sin crear reglas: si ya clasificaste antes movimientos del mismo comercio (misma clave de patron_sugerido), la
# próxima vez se usa esa categoría. Así cada corrección, aunque no marques «recordar», sirve para la siguiente.
def clave(texto):
    return patron_sugerido(texto or "")

def memoria(movimientos):
    """{clave del comercio: Counter((clase, categoría))} de los movimientos importados ya clasificados."""
    mem = {}
    for m in movimientos:
        if m.get("clase") not in ("gasto", "ingreso", "reembolso") or not m.get("categoria") or not m.get("ext_texto"): continue
        k = clave(m["ext_texto"])
        if len(k) < 3: continue
        clase = "gasto" if m["clase"] == "reembolso" else m["clase"]
        mem.setdefault(k, Counter())[(clase, m["categoria"])] += 1
    return mem

def _con_signo(clase, imp):
    if clase == "gasto" and imp > 0: return "reembolso"
    if clase == "ingreso" and imp < 0: return "gasto"
    return clase

def por_memoria(texto, imp, mem, minimo=1):
    """(clase, categoría) si tu historial con ese comercio es claro (≥ 75 % la misma y al menos `minimo` veces)."""
    c = (mem or {}).get(clave(texto))
    if not c: return None
    (clase, cat), n = c.most_common(1)[0]
    if n < minimo or n / sum(c.values()) < 0.75: return None
    if (clase == "ingreso") != (imp > 0) and not (clase == "gasto" and imp > 0): return None
    return _con_signo(clase, imp), cat

def sugerir(texto, imp, mem, cat_actual=""):
    """Para «Por revisar»: la categoría más probable {clase, categoria, motivo} o None.
    Mismo comercio en tu historial → la más usada; si no, el comercio más parecido que conozcas."""
    k = clave(texto)
    signo = "ingreso" if imp > 0 else "gasto"
    def mejor(c, motivo):
        for (clase, cat), _ in c.most_common():
            if clase == signo or (clase == "gasto" and imp > 0): return {"clase": _con_signo(clase, imp), "categoria": cat, "motivo": motivo}
        return None
    if mem and k in mem:
        r = mejor(mem[k], "como las otras veces")
        if r: return r
    if mem and len(k) >= 4:
        for parecido in difflib.get_close_matches(k, list(mem), n=3, cutoff=0.78):
            r = mejor(mem[parecido], f"parecido a «{titulo(parecido)}»")
            if r: return r
    if cat_actual and cat_actual not in ("Otros", "Otros ingresos"):
        return {"clase": signo if imp < 0 else "ingreso", "categoria": cat_actual, "motivo": "por el concepto"}
    return None

def clasificar_fila(f, todas, reglas, cuentas, recurrentes, cuenta_propia, categorias=None, mem=None):
    """f: {op, texto, importe}. Devuelve {clase, cat, concepto, destino?/origen?, recurrente?, duda?}.
    todas: todas las filas del archivo ya clasificadas hasta aquí (para los Bizums recibidos)."""
    t, tn, imp = f["texto"], norm(f["texto"]), f["importe"]
    r = {"clase": "gasto" if imp < 0 else "ingreso", "cat": "", "concepto": titulo(comercio(t) or re.sub(r",.*$", "", t) or "Movimiento")}
    def con(**kw):
        r.update(kw)
        return r
    otras = [c for c in cuentas if c["nombre"] != cuenta_propia]
    # 1) Reglas (las del usuario mandan)
    regla = regla_para(t, reglas)
    if regla and regla.get("clase") == "transferencia":
        otra = regla.get("cuenta_otra")
        if otra: return enlazar(con(clase="transferencia", **({"destino": otra} if imp < 0 else {"origen": otra}), concepto=f"{'A' if imp < 0 else 'Desde'} {otra}"), f, recurrentes)
        return con(clase="transferencia", duda="Traspaso: ¿a qué cuenta tuya va (o de cuál viene)?")
    if regla:
        clase = regla.get("clase") or r["clase"]
        if clase == "gasto" and imp > 0: clase = "reembolso"  # p. ej. devolución de un comercio con regla de gasto
        if clase == "ingreso" and imp < 0: clase = "gasto"
        out = con(clase=clase, cat=regla.get("categoria") or "", **({"recurrente": regla["recurrente"]} if regla.get("recurrente") else {}))
        return enlazar(out, f, recurrentes)
    # 2) Traspasos entre cuentas propias: el texto nombra otra cuenta del usuario
    for c in otras:
        n = norm(c["nombre"])
        if len(n) >= 4 and casa(n, tn) and re.search(r"traspaso|transferencia|trasp\.|a cuenta|de cuenta", tn):
            return con(clase="transferencia", **({"destino": c["nombre"]} if imp < 0 else {"origen": c["nombre"]}), concepto=f"{'A' if imp < 0 else 'Desde'} {c['nombre']}")
    if re.match(r"(traspaso|transferencia (interna|entre cuentas))", tn):
        return con(clase="transferencia", concepto=titulo(t), duda="Traspaso: ¿a qué cuenta tuya va (o de cuál viene), o es un gasto/ingreso?")
    # 3) Bizum enviado: categoría según el concepto
    m = re.search(r"bizum (?:a favor de|enviado a|a)\s+(.+?)(?:\s+concepto:?\s*(.*))?$", t, re.I)
    if m and imp < 0:
        quien, conc = titulo(m.group(1)), (m.group(2) or "").strip()
        base = titulo(conc) if conc and "sin concepto" not in norm(conc) else f"Bizum a {quien.split(' ')[0]}"
        cat = cat_por_palabras(conc)
        if cat: return con(cat=cat, concepto=base)
        aprendido = por_memoria(t, imp, mem, minimo=2)
        if aprendido: return con(clase=aprendido[0], cat=aprendido[1], concepto=base, aprendido=True)
        return con(cat="Otros", concepto=base, duda=f"Bizum a {quien} «{conc or 'sin concepto'}»: ¿de qué es?")
    # 4) Bizum recibido: la parte de un gasto compartido de ese día o el anterior → te lo devuelven
    m = re.search(r"bizum (?:de|recibido de)\s+(.+?)(?:\s+concepto:?\s*(.*))?$", t, re.I)
    if m and imp > 0:
        quien, conc = titulo(m.group(1)), (m.group(2) or "").strip()
        nombre = quien.split(" ")[0]
        cat = cat_por_palabras(conc)
        if not cat:
            dia = datetime.date.fromisoformat(f["op"])
            cerca = [g for g in todas if g is not f and g.get("clase") == "gasto" and g.get("cat") and not g.get("duda") and g["cat"] != "Otros" and abs(g["importe"]) >= imp
                     and 0 <= (dia - datetime.date.fromisoformat(g["op"])).days <= 1]
            if cerca: cat = max(cerca, key=lambda g: abs(g["importe"]))["cat"]
        if cat: return con(clase="reembolso", cat=cat, concepto=f"Parte de {nombre}")
        aprendido = por_memoria(t, imp, mem, minimo=2)
        if aprendido: return con(clase=aprendido[0], cat=aprendido[1], concepto=f"Bizum de {nombre}", aprendido=True)
        return con(clase="ingreso", cat="Otros ingresos", concepto=f"Bizum de {nombre}",
                   duda=f"Bizum de {quien} «{conc or 'sin concepto'}» sin un gasto cercano: ¿te devuelve algo o es un ingreso?")
    # 5) Devolución de una compra
    if tn.startswith("devolucion") or " devolucion" in tn:
        return con(clase="reembolso", cat="Compras", concepto=f"Devolución {comercio(t) or ''}".strip(), duda="Devolución: ¿de qué categoría era la compra?")
    # 6) Sin regla: lo que ya clasificaste antes con ese comercio; si no, duda
    aprendido = por_memoria(t, imp, mem)
    if aprendido: return enlazar(con(clase=aprendido[0], cat=aprendido[1], aprendido=True), f, recurrentes)
    if imp > 0: return con(cat="Otros ingresos", duda="Ingreso sin identificar: ¿qué es?")
    return con(cat="Otros", duda="Comercio o recibo desconocido: ¿qué categoría es?")

def aplica(regla_o_patron, texto):
    """¿Casa este patrón con el texto (limpio de coletillas)?"""
    return casa(regla_o_patron, limpio(texto))

def enlazar(r, f, recurrentes):
    """Si el movimiento corresponde a un recurrente (misma categoría y clase, importe parecido, activo ese mes) lo enlaza:
    así no se cuenta dos veces (el recurrente deja de generar su movimiento automático ese mes)."""
    if r.get("recurrente") or r.get("duda") or r["clase"] not in ("gasto", "ingreso"): return r
    imp, mes = abs(f["importe"]), int(f["op"][5:7])
    for rec in recurrentes:
        if rec.get("activo") is False or rec.get("clase") != r["clase"] or rec.get("categoria") != r.get("cat"): continue
        if rec.get("desde") and f["op"] < rec["desde"][:8] + "01": continue
        if rec.get("hasta") and f["op"] > rec["hasta"]: continue
        if rec.get("meses") and mes not in rec["meses"]: continue
        tol = max(1.0, float(rec.get("importe") or 0) * (0.10 if r["clase"] == "ingreso" else 0.03))
        if abs(imp - float(rec.get("importe") or 0)) <= tol:
            r["recurrente"] = rec["nombre"]
            break
    return r
