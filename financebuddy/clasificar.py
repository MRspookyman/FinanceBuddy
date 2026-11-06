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
    """Usuario con concepto, usuario sin concepto (recientes primero), y por último las de serie."""
    usuario = sorted([r for r in reglas if r.get("origen") != "plantilla"], key=lambda r: (not bool(r.get("concepto")), -r.get("id", 0)))
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
    t, b = limpio(texto), bizum_de(texto)
    return next((r for r in ordenar_reglas(reglas) if casa(r["patron"], t)
                 and (not r.get("concepto") or b and casa(r["concepto"], norm(b["concepto"])))), None)

def titulo(s):
    s = re.sub(r"\s+", " ", str(s)).strip(" ,./")
    if s.isupper() and len(s) > 4: s = s.lower()  # «MERCADONA VALENCIA» → «Mercadona Valencia»
    return " ".join(w if (w.isupper() and len(w) <= 4) else w.capitalize() for w in s.split(" "))[:60]

RE_COMERCIO = re.compile(r"(?:pago movil en|transaccion contactless en|compra internet en|compra con tarjeta en|pago con tarjeta en|cargo por compra en|"
                         r"compra en|pago en|compra tarj\.?(?:\s*:)?|compra)\s+(.+?)(?:,|$)", re.I)

# Prefijos de las pasarelas de pago («SQ *Bar Pepe», «WL *Steam», «MGP*Wallapop»…) y números de tienda delante
# («12229 Pull and…»): no son el comercio.
RE_PASARELA = re.compile(r"^(?:(?:sq|wl|mgp|pp|paypal|sumup|sum ?up|zettle|izettle|sp|stripe)\s*\*\s*|sq\s+|\d{3,}\s+)", re.I)

def comercio(texto):
    """Nombre del comercio en textos del tipo «Compra X, Ciudad…» (o None)."""
    m = RE_COMERCIO.search(re.sub(r"\s+", " ", RE_TARJETA.sub(" ", texto)))
    if not m: return None
    nombre = RE_PASARELA.sub("", m.group(1).strip()).strip() or m.group(1).strip()
    return titulo(re.sub(r"\s+\d{3,}$", "", nombre))


def bizum_de(texto):
    m = re.search(r"bizum (?:a favor de|enviado a|recibido de|a|de)\s+(.+?)(?:\s+concepto:?\s*(.*))?$", texto or "", re.I)
    return {"persona": titulo(m.group(1)), "concepto": (m.group(2) or "").strip()} if m else None
def patron_sugerido(texto):
    """Texto corto que identifica el movimiento, para ofrecer «recordar para la próxima vez»."""
    c = comercio(texto)
    b = bizum_de(texto)
    if b: return norm(b["persona"])
    if c: return norm(c)
    t = limpio(texto)
    t = re.sub(r"^(recibo|adeudo|transferencia|bizum|cargo|abono|pago)( inmediata| recibida| emitida)?( a favor de| de| a)?\s+", "", t)
    t = re.sub(r"^[^a-z0-9]+", "", t)
    t = re.sub(r"\b(concepto|ref|referencia)\b.*$", "", t)
    t = re.sub(r"(^|\s)[\d/.,:-]{4,}.*$", "", t).strip()
    return " ".join(t.split(" ")[:3]).strip(" ,.;:")

# Palabras del concepto de un Bizum → categoría
KW_BIZUM = [(r"\b(cenas?|comidas?|comi|comer|copas?|cerve\w*|desayun\w*|bocatas?|pizzas?|tapas|vermus?|burgers?|chiringos?|tintos?|cocacolas?|refrescos?|cafes?|helados?|kebabs?|sushi|bar|bares)\b", "Comer fuera"),
            (r"\b(padel|cine|entradas?|conciertos?|futbol|partidos?)\b", "Ocio"), (r"\b(cumple\w*|regalos?)\b", "Regalos"),
            (r"\b(gasolina|gasofa|gasoil|diesel|peajes?)\b", "Coche"),
            (r"\b(wifi|luz|agua|gas|internet)\b", "Suministros"), (r"\b(alquiler(?:es)?|pisos?)\b", "Vivienda"), (r"\b(taxis?|uber|cabify)\b", "Transporte"), (r"\b(viajes?|hotel(?:es)?|vuelos?|billetes?)\b", "Viajes"),
            (r"\b(super(?:mercados?)?|compras?)\b", "Supermercado")]

def texto_para_pistas(texto):
    """Solo el comercio o concepto, sin instrucciones ni datos técnicos del banco."""
    b = bizum_de(texto)
    if b: return norm(b["concepto"])
    t = limpio(comercio(texto) or texto)
    t = re.sub(r"\b(?:comision|fecha valor|fecha operacion|tarj(?:eta)?\.?).*$", "", t)
    t = re.sub(r"\b(?:pago movil en|pago con tarjeta en|compra con tarjeta en|compra en|pago en)\b", " ", t)
    return t.strip()

def cat_por_palabras(s):
    return next((c for pat, c in KW_BIZUM if re.search(pat, norm(s))), None)

# ───────────── lo aprendido de tu historial ─────────────
# El historial solo propone categorías en Por revisar: nunca clasifica una importación.
def clave(texto):
    return patron_sugerido(texto or "")

def memoria(movimientos):
    """{clave del comercio: Counter((clase, categoría))} de los movimientos importados ya clasificados."""
    mem = {}
    for m in movimientos:
        if m.get("clase") not in ("gasto", "ingreso", "reembolso") or not m.get("categoria") or not m.get("ext_texto"): continue
        if m.get("parte_de"): continue  # una parte de un movimiento dividido no dice de qué es el comercio
        k = clave(m["ext_texto"])
        if len(k) < 3: continue
        clase = "gasto" if m["clase"] == "reembolso" else m["clase"]
        mem.setdefault(k, Counter())[(clase, m["categoria"])] += 1
    return mem

def _con_signo(clase, imp):
    if clase == "gasto" and imp > 0: return "reembolso"
    if clase == "ingreso" and imp < 0: return "gasto"
    return clase


def sugerir(texto, imp, mem, cat_actual="", contar=False):
    """Para «Por revisar»: la categoría más probable {clase, categoria, motivo} o None.
    Mismo comercio en tu historial → la más usada; si no, el comercio más parecido que conozcas."""
    k = clave(texto)
    signo = "ingreso" if imp > 0 else "gasto"
    def mejor(c, motivo):
        for (clase, cat), veces in c.most_common():
            if clase == signo or (clase == "gasto" and imp > 0):
                return {"clase": _con_signo(clase, imp), "categoria": cat, "motivo": motivo, **({"veces": veces} if contar else {})}
        return None
    if mem and k in mem:
        r = mejor(mem[k], "como las otras veces")
        if r: return r
    if mem and len(k) >= 4:
        for parecido in difflib.get_close_matches(k, list(mem), n=3, cutoff=0.78):
            r = mejor(mem[parecido], f"parecido a «{titulo(parecido)}»")
            if r: return r
    if cat_actual and cat_actual not in ("Otros", "Otros ingresos"):
        return {"clase": signo if imp < 0 else "ingreso", "categoria": cat_actual, "motivo": "por el concepto", "segura": False}
    return None

def detalle_revision(f, movimientos, categorias):
    """Contexto local de la tarjeta: historial, racha y categorías válidas, sin tomar decisiones."""
    texto, imp = f.get("texto", ""), f.get("importe", 0)
    b, k = bizum_de(texto), clave(texto)
    ingreso = f.get("clase") == "ingreso" if f.get("clase") else imp > 0
    validas = [c["nombre"] for c in categorias if not c.get("oculta") and (c.get("grupo") == "ingreso") == ingreso]
    previos = [m for m in movimientos if not m.get("parte_de") and m.get("categoria") in validas
               and (m.get("clase") == "ingreso") == ingreso and clave(m.get("ext_texto") or "") == k and k]
    previos.sort(key=lambda m: (m.get("fecha", ""), m.get("id", 0)), reverse=True)
    cuenta = Counter(m["categoria"] for m in previos)
    historial = [{"categoria": cat, "n": n} for cat, n in cuenta.most_common()]
    out = {"historial": historial, "botones": []}
    if b: out["bizum"] = b
    if previos:
        cat, n = previos[0]["categoria"], 0
        for m in previos:
            if m["categoria"] != cat: break
            n += 1
        out["racha"] = {"categoria": cat, "n": n}
    palabras_cat = []
    for pat, cat in KW_BIZUM:
        m = re.search(pat, texto_para_pistas(texto))
        if m and cat in validas:
            palabras_cat.append(cat)
            if not historial and "palabra" not in out: out["palabra"] = {"palabra": m.group(0), "categoria": cat}
    general = Counter(m["categoria"] for m in movimientos if not m.get("parte_de") and m.get("categoria") in validas)
    for cat in [h["categoria"] for h in historial] + palabras_cat + [c for c, _ in general.most_common()] + validas:
        if cat not in out["botones"]: out["botones"].append(cat)
        if len(out["botones"]) == 6: break
    return out


# ───────────── aconsejar una categoría nueva ─────────────
# Cuando un pago no tiene una categoría clara (ni historial ni sugerencia fiable) y ninguna de las tuyas encaja, se puede ACONSEJAR
# crear una de las «típicas» (plantilla.CATALOGO) por las palabras del concepto. Solo aconseja: crearla es decisión del usuario.
def _consejo(e, categorias, fusionadas, palabra=""):
    """El consejo para una entrada del catálogo, o None si ya tienes una categoría que cubre eso.
    {accion: crear|mostrar, nombre, icono, grupo, clase, motivo}. `mostrar`: la tienes, pero oculta."""
    ya = {norm(c.get("nombre", "")): c for c in categorias or []}
    fus = {norm(n) for n in (fusionadas or {})}
    propios = [e["nombre"]] + list(e.get("alias") or [])
    if any(norm(n) in fus for n in propios): return None  # la fusionaste en otra: ya está cubierta
    if any(norm(n) in ya and not ya[norm(n)].get("oculta") for n in propios + list(e.get("cubre") or [])): return None
    oculta = next((ya[norm(n)] for n in propios if norm(n) in ya), None)
    base = {"clase": "gasto", "icono": e["icono"], "grupo": e["grupo"], "fuente": "local"}
    donde = f"«{palabra}» " if palabra else "Esto "
    if oculta:
        return {**base, "accion": "mostrar", "nombre": oculta["nombre"], "icono": oculta.get("icono") or e["icono"], "grupo": oculta.get("grupo") or e["grupo"],
                "motivo": f"{donde}parece de {e['tema']} y tienes la categoría «{oculta['nombre']}» oculta."}
    return {**base, "accion": "crear", "nombre": e["nombre"],
            "motivo": f"{donde}parece de {e['tema']} y no tienes ninguna categoría para eso."}

def proponer_categoria_nueva(texto, importe, categorias, fusionadas=None):
    """Solo gastos. {accion: crear|mostrar, nombre, icono, grupo, clase, motivo, fuente} o None. `categorias`: todas, también las ocultas."""
    if importe >= 0: return None
    from .plantilla import CATALOGO
    t = limpio(texto)
    mejor = None
    for e in CATALOGO:
        ps = [p for p in e["palabras"] if casa(p, t)]
        if not ps: continue
        puntos = (len(ps), max(len(p) for p in ps))
        if mejor is None or puntos > mejor[0]: mejor = (puntos, e, max(ps, key=len))
    if not mejor: return None
    return _consejo(mejor[1], categorias, fusionadas, mejor[2])


# Categorías que no se reparten con amigos: un Bizum recibido no es «tu parte» de un recibo o de una suscripción.
NO_COMPARTIDAS = {"Suscripciones", "Comisiones", "Efectivo", "Apuestas", "Seguros", "Suministros"}

def palabras(s):
    return set(re.findall(r"[a-z0-9]+", norm(s)))

def es_titular(texto, titulares):
    """¿Aparece en el texto el nombre de alguno de los titulares (todas sus palabras, en cualquier orden)?"""
    ps = palabras(texto)
    return any(len(t) >= 2 and t <= ps for t in (titulares or []))

def titulares_de(nombres):
    """Nombres de titular (config «titulares») → conjuntos de palabras para es_titular()."""
    return [{w for w in palabras(n) if len(w) >= 3} for n in nombres or [] if n]

def clasificar_fila(f, todas, reglas, cuentas, recurrentes, cuenta_propia, categorias=None, titulares=None, previos=None):
    """f: {op, texto, importe}. Devuelve {clase, cat, concepto, destino?/origen?, recurrente?, duda?}.
    todas: todas las filas del archivo ya clasificadas hasta aquí (para los Bizums recibidos).
    previos: gastos y Bizums ya guardados fuera de las fechas del archivo (bizums.previos)."""
    t, tn, imp = f["texto"], norm(f["texto"]), f["importe"]
    r = {"clase": "gasto" if imp < 0 else "ingreso", "cat": "", "concepto": titulo(comercio(t) or re.sub(r",.*$", "", t) or "Movimiento")}
    def con(**kw):
        r.update(kw)
        if r.get("duda"): r.pop("auto", None)
        return r
    otras = [c for c in cuentas if c["nombre"] != cuenta_propia]
    # 1) Reglas (las del usuario mandan)
    regla = regla_para(t, reglas)
    if regla and regla.get("accion") == "preguntar":
        return con(preguntar=True, duda="Me pediste que te preguntara cada vez.")
    if regla:
        r["auto"] = {"regla": regla["id"], "serie": regla.get("origen") == "plantilla"}
    if regla and regla.get("clase") == "transferencia":
        otra = regla.get("cuenta_otra")
        # Una regla de traspaso se aprende en una cuenta («a Ahorro») y vale también al importar la otra: en el extracto de
        # Ahorro, «la otra cuenta» no puede ser Ahorro. Si solo hay otra cuenta, es esa; si hay más, se pregunta.
        if otra and otra == cuenta_propia: otra = otras[0]["nombre"] if len(otras) == 1 else None
        if otra: return enlazar(con(clase="transferencia", **({"destino": otra} if imp < 0 else {"origen": otra}), concepto=f"{'A' if imp < 0 else 'Desde'} {otra}"), f, recurrentes)
        return con(clase="transferencia", duda="Traspaso: ¿a qué cuenta tuya va (o de cuál viene)?")
    if regla:
        clase = regla.get("clase") or r["clase"]
        if clase == "gasto" and imp > 0: clase = "reembolso"  # p. ej. devolución de un comercio con regla de gasto
        if clase == "ingreso" and imp < 0: clase = "gasto"
        out = con(clase=clase, cat=regla.get("categoria") or "", **({"recurrente": regla["recurrente"]} if regla.get("recurrente") else {}))
        return enlazar(out, f, recurrentes)
    # 2) Dinero a tu nombre (a otra cuenta tuya o desde ella): traspaso. La cuenta la dice el cruce entre extractos
    #    (importar.emparejar_traspasos) o el usuario.
    if titulares and re.search(r"transferencia|traspaso|bizum|a favor de|\bde\b", tn) and es_titular(t, titulares):
        return con(clase="transferencia", concepto="A otra cuenta tuya" if imp < 0 else "Desde otra cuenta tuya",
                   duda="Dinero a tu nombre: ¿a qué cuenta tuya va (o de cuál viene)?")
    # 2b) Traspasos entre cuentas propias: el texto nombra otra cuenta del usuario
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
        return con(cat=cat or "Otros", concepto=base, duda=f"Bizum a {quien} «{conc or 'sin concepto'}»: ¿de qué es?")
    # 4) Bizum recibido: la parte de un gasto compartido de ese día o el anterior → te lo devuelven
    m = re.search(r"bizum (?:de|recibido de)\s+(.+?)(?:\s+concepto:?\s*(.*))?$", t, re.I)
    if m and imp > 0:
        quien, conc = titulo(m.group(1)), (m.group(2) or "").strip()
        nombre = quien.split(" ")[0]
        from . import bizums
        cat = cat_por_palabras(conc)
        recibidos = [{"fecha": g["op"], "importe": g["importe"]} for g in todas if g["importe"] > 0 and bizums.es_bizum(g["texto"])] + (previos or {}).get("bizums", [])
        if not cat:  # ¿de qué gasto tuyo es? (un reparto exacto, o el gasto del día o el anterior)
            fijas = {n for n, g in (categorias or {}).items() if g == "fijo"}
            gastos = [{"fecha": g["op"], "importe": abs(g["importe"]), "cat": g["cat"], "texto": g["texto"]} for g in todas
                      if g is not f and g.get("clase") == "gasto" and g.get("cat") and not g.get("duda")] + (previos or {}).get("gastos", [])
            c = bizums.casar(imp, f["op"], gastos, recibidos, fijas)
            if c: cat = c["gasto"]["cat"]
        if cat: return con(clase="reembolso", cat=cat, concepto=f"Parte de {nombre}")
        n = bizums.iguales(imp, f["op"], recibidos)
        return con(clase="ingreso", cat="Otros ingresos", concepto=f"Bizum de {nombre}",
                   duda=f"Bizum de {quien} «{conc or 'sin concepto'}»: " + (f"{n} Bizums iguales a la vez, parece un reparto, pero no encuentro el gasto. ¿De qué era?" if n >= 2
                                                                         else "sin un gasto cercano: ¿te devuelve algo o es un ingreso?"))
    # 5) Devolución de una compra
    if tn.startswith("devolucion") or " devolucion" in tn:
        return con(clase="reembolso", cat="Compras", concepto=f"Devolución {comercio(t) or ''}".strip(), duda="Devolución: ¿de qué categoría era la compra?")
    # 6) Sin regla, siempre se pregunta; el historial solo sugiere en Por revisar.
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
